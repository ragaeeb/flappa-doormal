import { normalizeLineEndings } from './segmentation/textUtils.js';
import { getAvailableTokens, TOKEN_PATTERNS } from './segmentation/tokens.js';
import type { Page } from './segmentation/types.js';

export type LineStartAnalysisOptions = {
    /** Return top K patterns (after filtering). Default: 20 */
    topK?: number;
    /** Only consider the first N characters of each trimmed line. Default: 60 */
    prefixChars?: number;
    /** Ignore lines shorter than this (after trimming). Default: 6 */
    minLineLength?: number;
    /** Only include patterns that appear at least this many times. Default: 3 */
    minCount?: number;
    /** Keep up to this many example lines per pattern. Default: 5 */
    maxExamples?: number;
    /**
     * If true, include a literal first word when no token match is found at the start.
     * Default: true
     */
    includeFirstWordFallback?: boolean;
    /**
     * If true, strip Arabic diacritics (harakat/tashkeel) for the purposes of matching tokens.
     * This helps patterns like `وأَخْبَرَنَا` match the `{{naql}}` token (`وأخبرنا`).
     *
     * Note: examples are still stored in their original (unstripped) form.
     *
     * Default: true
     */
    normalizeArabicDiacritics?: boolean;
};

export type LineStartPatternExample = { line: string; pageId: number };

export type CommonLineStartPattern = {
    pattern: string;
    count: number;
    examples: LineStartPatternExample[];
};

const countTokenMarkers = (pattern: string): number => (pattern.match(/\{\{/g) ?? []).length;

const stripWhitespacePlaceholders = (pattern: string): string => pattern.replace(/\\s\*/g, '');

// Heuristic: higher is "more precise".
// - More tokens usually means more structured prefix
// - More literal characters (after removing \s*) indicates more constraints (e.g. ":" or "[")
const computeSpecificity = (pattern: string): { literalLen: number; tokenCount: number } => {
    const tokenCount = countTokenMarkers(pattern);
    const literalLen = stripWhitespacePlaceholders(pattern).length;
    return { literalLen, tokenCount };
};

const DEFAULT_OPTIONS: Required<LineStartAnalysisOptions> = {
    includeFirstWordFallback: true,
    maxExamples: 1,
    minCount: 3,
    minLineLength: 6,
    normalizeArabicDiacritics: true,
    prefixChars: 60,
    topK: 40,
};

const escapeRegexLiteral = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Keep this intentionally focused on "useful at line start" tokens, avoiding overly-generic tokens like {{harf}}.
const TOKEN_PRIORITY_ORDER: string[] = [
    'basmalah',
    'kitab',
    'bab',
    'fasl',
    'naql',
    'rumuz',
    'numbered',
    'raqms',
    'raqm',
    'dash',
    'bullet',
    'tarqim',
];

const buildTokenPriority = (): string[] => {
    const allTokens = new Set(getAvailableTokens());
    // IMPORTANT: We only use an explicit allow-list here.
    // Including "all remaining tokens" adds overly-generic tokens (e.g., harf) which makes signatures noisy.
    return TOKEN_PRIORITY_ORDER.filter((t) => allTokens.has(t));
};

const collapseWhitespace = (s: string): string => s.replace(/\s+/g, ' ').trim();

// Arabic diacritics / tashkeel marks that commonly appear in Shamela texts.
// This is intentionally conservative: remove combining marks but keep letters.
const stripArabicDiacritics = (s: string): string =>
    // harakat + common Quranic marks + tatweel
    s.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/gu, '');

const tokenizeLineStart = (
    line: string,
    tokenNames: string[],
    prefixChars: number,
    includeFirstWordFallback: boolean,
    normalizeArabicDiacritics: boolean,
): string | null => {
    const trimmed = collapseWhitespace(line);
    if (!trimmed) {
        return null;
    }

    const s = (normalizeArabicDiacritics ? stripArabicDiacritics(trimmed) : trimmed).slice(0, prefixChars);
    let pos = 0;
    let out = '';
    let matchedAny = false;

    // Pre-compile regexes once per call (tokenNames is small); use sticky to match at position.
    const compiled: Array<{ token: string; re: RegExp }> = [];
    for (const token of tokenNames) {
        const pat = TOKEN_PATTERNS[token];
        if (!pat) {
            continue;
        }
        try {
            compiled.push({ re: new RegExp(pat, 'uy'), token });
        } catch {
            // Ignore invalid patterns
        }
    }

    const appendWs = () => {
        if (out && !out.endsWith('\\s*')) {
            out += '\\s*';
        }
    };

    const isArabicLetter = (ch: string): boolean => /[\u0600-\u06FF]/u.test(ch);
    const isCommonDelimiter = (ch: string): boolean => /[:：\-–—ـ،؛.?!؟()[\]{}]/u.test(ch);

    // Scan forward at most a few steps to avoid producing huge unique strings.
    for (let steps = 0; steps < 6 && pos < s.length; steps++) {
        // Skip whitespace and represent it as \\s*
        const wsMatch = /^[ \t]+/u.exec(s.slice(pos));
        if (wsMatch) {
            pos += wsMatch[0].length;
            appendWs();
            continue;
        }

        let best: { token: string; text: string } | null = null;

        for (const { token, re } of compiled) {
            re.lastIndex = pos;
            const m = re.exec(s);
            if (!m || m.index !== pos) {
                continue;
            }
            const text = m[0];
            if (!best || text.length > best.text.length) {
                best = { text, token };
            }
        }

        if (best) {
            // Guard: single-letter rumuz can overlap with normal Arabic words (e.g. "قال").
            // Only accept rumuz when it's followed by a delimiter/whitespace/end, not a letter.
            if (best.token === 'rumuz') {
                const end = pos + best.text.length;
                const next = end < s.length ? s[end] : '';
                if (next && isArabicLetter(next) && !/\s/u.test(next)) {
                    best = null;
                }
            }
        }

        if (best) {
            if (out && !out.endsWith('\\s*')) {
                // If we have no whitespace but are concatenating tokens, keep it literal.
            }
            out += `{{${best.token}}}`;
            matchedAny = true;
            pos += best.text.length;
            continue;
        }

        // After matching tokens, allow common delimiters (like ':' in "١١٢٨ ع:") to become part of the signature.
        if (matchedAny) {
            const ch = s[pos];
            if (ch && isCommonDelimiter(ch)) {
                out += escapeRegexLiteral(ch);
                pos += 1;
                continue;
            }
        }

        // If we already matched something token-y, stop at first unknown content to avoid overfitting.
        if (matchedAny) {
            break;
        }

        if (!includeFirstWordFallback) {
            return null;
        }

        // Fallback: include the first word as a literal (escaped), then stop.
        const firstWord = (s.slice(pos).match(/^[^\s:،؛.?!؟]+/u) ?? [])[0];
        if (!firstWord) {
            return null;
        }
        out += escapeRegexLiteral(firstWord);
        return out;
    }

    if (!matchedAny) {
        return null;
    }
    // Avoid trailing whitespace placeholder noise.
    while (out.endsWith('\\s*')) {
        out = out.slice(0, -3);
    }
    return out;
};

/**
 * Analyze pages and return the most common line-start patterns (top K).
 *
 * This is a pure algorithmic heuristic: it tokenizes common prefixes into a stable
 * template-ish string using the library tokens (e.g., `{{bab}}`, `{{raqms}}`, `{{rumuz}}`).
 */
export const analyzeCommonLineStarts = (
    pages: Page[],
    options: LineStartAnalysisOptions = {},
): CommonLineStartPattern[] => {
    const o = { ...DEFAULT_OPTIONS, ...options };
    const tokenPriority = buildTokenPriority();

    const counts = new Map<string, { count: number; examples: LineStartPatternExample[] }>();

    for (const page of pages) {
        const normalized = normalizeLineEndings(page.content ?? '');
        const lines = normalized.split('\n');
        for (const line of lines) {
            const trimmed = collapseWhitespace(line);
            if (trimmed.length < o.minLineLength) {
                continue;
            }

            const sig = tokenizeLineStart(
                trimmed,
                tokenPriority,
                o.prefixChars,
                o.includeFirstWordFallback,
                o.normalizeArabicDiacritics,
            );
            if (!sig) {
                continue;
            }

            const existing = counts.get(sig);
            if (!existing) {
                counts.set(sig, { count: 1, examples: [{ line: trimmed, pageId: page.id }] });
            } else {
                existing.count++;
                if (existing.examples.length < o.maxExamples) {
                    existing.examples.push({ line: trimmed, pageId: page.id });
                }
            }
        }
    }

    const sorted: CommonLineStartPattern[] = [...counts.entries()]
        .map(([pattern, v]) => ({ count: v.count, examples: v.examples, pattern }))
        .filter((p) => p.count >= o.minCount)
        .sort((a, b) => {
            const sa = computeSpecificity(a.pattern);
            const sb = computeSpecificity(b.pattern);
            // Most precise first
            if (sb.tokenCount !== sa.tokenCount) {
                return sb.tokenCount - sa.tokenCount;
            }
            if (sb.literalLen !== sa.literalLen) {
                return sb.literalLen - sa.literalLen;
            }
            // Then by frequency
            if (b.count !== a.count) {
                return b.count - a.count;
            }
            return a.pattern.localeCompare(b.pattern);
        });

    return sorted.slice(0, o.topK);
};
