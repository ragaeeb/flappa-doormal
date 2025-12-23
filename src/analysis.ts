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
    /**
     * How to sort patterns before applying `topK`.
     *
     * - `specificity` (default): prioritize more structured prefixes first (tokenCount, then literalLen), then count.
     * - `count`: prioritize highest-frequency patterns first, then specificity.
     */
    sortBy?: 'specificity' | 'count';
    /**
     * Optional filter to restrict which lines are analyzed.
     *
     * The `line` argument is the trimmed + whitespace-collapsed version of the line.
     * Return `true` to include it, `false` to skip it.
     *
     * @example
     * // Only analyze markdown H2 headings
     * { lineFilter: (line) => line.startsWith('## ') }
     */
    lineFilter?: (line: string, pageId: number) => boolean;
    /**
     * Optional list of prefix matchers to consume before tokenization.
     *
     * This is for "syntactic" prefixes that are common at line start but are not
     * meaningful as tokens by themselves (e.g. markdown headings like `##`).
     *
     * Each matcher is applied at the current position. If it matches, the matched
     * text is appended (escaped) to the signature and the scanner advances.
     *
     * @example
     * // Support markdown blockquotes and headings
     * { prefixMatchers: [/^>+/u, /^#+/u] }
     */
    prefixMatchers?: RegExp[];
    /**
     * How to represent whitespace in returned `pattern` signatures.
     *
     * - `regex` (default): use `\\s*` placeholders between tokens (useful if you paste patterns into regex-ish templates).
     * - `space`: use literal single spaces (`' '`) between tokens (safer if you don't want `\\s` to match newlines when reused as regex).
     */
    whitespace?: 'regex' | 'space';
};

export type LineStartPatternExample = { line: string; pageId: number };

export type CommonLineStartPattern = {
    pattern: string;
    count: number;
    examples: LineStartPatternExample[];
};

const countTokenMarkers = (pattern: string): number => (pattern.match(/\{\{/g) ?? []).length;

const stripWhitespacePlaceholders = (pattern: string): string =>
    // Remove both the regex placeholder and literal spaces/tabs since they are not meaningful "constraints"
    pattern.replace(/\\s\*/g, '').replace(/[ \t]+/g, '');

// Heuristic: higher is "more precise".
// - More tokens usually means more structured prefix
// - More literal characters (after removing \s*) indicates more constraints (e.g. ":" or "[")
const computeSpecificity = (pattern: string): { literalLen: number; tokenCount: number } => {
    const tokenCount = countTokenMarkers(pattern);
    const literalLen = stripWhitespacePlaceholders(pattern).length;
    return { literalLen, tokenCount };
};

type ResolvedLineStartAnalysisOptions = Required<Omit<LineStartAnalysisOptions, 'lineFilter' | 'prefixMatchers'>> & {
    lineFilter?: LineStartAnalysisOptions['lineFilter'];
    prefixMatchers: RegExp[];
};

const DEFAULT_OPTIONS: ResolvedLineStartAnalysisOptions = {
    includeFirstWordFallback: true,
    lineFilter: undefined,
    maxExamples: 1,
    minCount: 3,
    minLineLength: 6,
    normalizeArabicDiacritics: true,
    prefixChars: 60,
    prefixMatchers: [/^#+/u],
    sortBy: 'specificity',
    topK: 40,
    whitespace: 'regex',
};

// For analysis signatures we avoid escaping ()[] because:
// - These are commonly used literally in texts (e.g., "(ح)")
// - When signatures are later used in template patterns, ()[] are auto-escaped there
// We still escape other regex metacharacters to keep signatures safe if reused as templates.
const escapeSignatureLiteral = (s: string): string => s.replace(/[.*+?^${}|\\{}]/g, '\\$&');

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

type CompiledTokenRegex = { token: string; re: RegExp };

const compileTokenRegexes = (tokenNames: string[]): CompiledTokenRegex[] => {
    const compiled: CompiledTokenRegex[] = [];
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
    return compiled;
};

const appendWs = (out: string, mode: 'regex' | 'space'): string => {
    if (!out) {
        return out;
    }
    if (mode === 'space') {
        return out.endsWith(' ') ? out : `${out} `;
    }
    return out.endsWith('\\s*') ? out : `${out}\\s*`;
};

const consumeLeadingPrefixes = (
    s: string,
    pos: number,
    out: string,
    prefixMatchers: RegExp[],
    whitespace: 'regex' | 'space',
): { matchedAny: boolean; out: string; pos: number } => {
    let matchedAny = false;
    let currentPos = pos;
    let currentOut = out;

    for (const re of prefixMatchers) {
        if (currentPos >= s.length) {
            break;
        }
        const m = re.exec(s.slice(currentPos));
        if (!m || m.index !== 0 || !m[0]) {
            continue;
        }

        currentOut += escapeSignatureLiteral(m[0]);
        currentPos += m[0].length;
        matchedAny = true;

        const wsAfter = /^[ \t]+/u.exec(s.slice(currentPos));
        if (wsAfter) {
            currentPos += wsAfter[0].length;
            currentOut = appendWs(currentOut, whitespace);
        }
    }

    return { matchedAny, out: currentOut, pos: currentPos };
};

const findBestTokenMatchAt = (
    s: string,
    pos: number,
    compiled: CompiledTokenRegex[],
    isArabicLetter: (ch: string) => boolean,
): { token: string; text: string } | null => {
    let best: { token: string; text: string } | null = null;
    for (const { token, re } of compiled) {
        re.lastIndex = pos;
        const m = re.exec(s);
        if (!m || m.index !== pos) {
            continue;
        }
        if (!best || m[0].length > best.text.length) {
            best = { text: m[0], token };
        }
    }

    if (best?.token === 'rumuz') {
        const end = pos + best.text.length;
        const next = end < s.length ? s[end] : '';
        if (next && isArabicLetter(next) && !/\s/u.test(next)) {
            return null;
        }
    }

    return best;
};

const tokenizeLineStart = (
    line: string,
    tokenNames: string[],
    prefixChars: number,
    includeFirstWordFallback: boolean,
    normalizeArabicDiacritics: boolean,
    prefixMatchers: RegExp[],
    whitespace: 'regex' | 'space',
): string | null => {
    const trimmed = collapseWhitespace(line);
    if (!trimmed) {
        return null;
    }

    const s = (normalizeArabicDiacritics ? stripArabicDiacritics(trimmed) : trimmed).slice(0, prefixChars);
    let pos = 0;
    let out = '';
    let matchedAny = false;
    let matchedToken = false;

    // Pre-compile regexes once per call (tokenNames is small); use sticky to match at position.
    const compiled = compileTokenRegexes(tokenNames);

    // IMPORTANT: do NOT treat all Arabic-block codepoints as "letters" (it includes punctuation like "،").
    // We only want to consider actual letters here for the rumuz boundary guard.
    const isArabicLetter = (ch: string): boolean => /\p{Script=Arabic}/u.test(ch) && /\p{L}/u.test(ch);
    const isCommonDelimiter = (ch: string): boolean => /[:：\-–—ـ،؛.?!؟()[\]{}]/u.test(ch);

    {
        const consumed = consumeLeadingPrefixes(s, pos, out, prefixMatchers, whitespace);
        pos = consumed.pos;
        out = consumed.out;
        matchedAny = consumed.matchedAny;
    }

    // Scan forward at most a few *token* steps to avoid producing huge unique strings.
    // Whitespace and delimiters do not count toward the token step budget.
    let tokenSteps = 0;
    while (tokenSteps < 6 && pos < s.length) {
        // Skip whitespace and represent it as \\s*
        const wsMatch = /^[ \t]+/u.exec(s.slice(pos));
        if (wsMatch) {
            pos += wsMatch[0].length;
            out = appendWs(out, whitespace);
            continue;
        }

        const best = findBestTokenMatchAt(s, pos, compiled, isArabicLetter);

        if (best) {
            if (out && !out.endsWith('\\s*')) {
                // If we have no whitespace but are concatenating tokens, keep it literal.
            }
            out += `{{${best.token}}}`;
            matchedAny = true;
            matchedToken = true;
            pos += best.text.length;
            tokenSteps++;
            continue;
        }

        // After matching tokens, allow common delimiters (like ':' in "١١٢٨ ع:") to become part of the signature.
        if (matchedAny) {
            const ch = s[pos];
            if (ch && isCommonDelimiter(ch)) {
                out += escapeSignatureLiteral(ch);
                pos += 1;
                continue;
            }
        }

        // If we already matched something token-y, stop at first unknown content to avoid overfitting.
        if (matchedAny) {
            // Exception: if we only matched a generic prefix (e.g., "##") and no tokens yet,
            // allow the first-word fallback to capture the next word to show heading variations.
            if (includeFirstWordFallback && !matchedToken) {
                const firstWord = (s.slice(pos).match(/^[^\s:،؛.?!؟]+/u) ?? [])[0];
                if (!firstWord) {
                    break;
                }
                out += escapeSignatureLiteral(firstWord);
                tokenSteps++;
            }
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
        out += escapeSignatureLiteral(firstWord);
        tokenSteps++;
        return out;
    }

    if (!matchedAny) {
        return null;
    }
    // Avoid trailing whitespace placeholder noise.
    if (whitespace === 'regex') {
        while (out.endsWith('\\s*')) {
            out = out.slice(0, -3);
        }
    } else {
        while (out.endsWith(' ')) {
            out = out.slice(0, -1);
        }
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
    const o: ResolvedLineStartAnalysisOptions = {
        ...DEFAULT_OPTIONS,
        ...options,
        // Ensure defaults are kept if caller doesn't pass these (or passes undefined).
        lineFilter: options.lineFilter ?? DEFAULT_OPTIONS.lineFilter,
        prefixMatchers: options.prefixMatchers ?? DEFAULT_OPTIONS.prefixMatchers,
        whitespace: options.whitespace ?? DEFAULT_OPTIONS.whitespace,
    };
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
            if (o.lineFilter && !o.lineFilter(trimmed, page.id)) {
                continue;
            }

            const sig = tokenizeLineStart(
                trimmed,
                tokenPriority,
                o.prefixChars,
                o.includeFirstWordFallback,
                o.normalizeArabicDiacritics,
                o.prefixMatchers,
                o.whitespace,
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

    const compareSpecificityThenCount = (a: CommonLineStartPattern, b: CommonLineStartPattern): number => {
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
    };

    const compareCountThenSpecificity = (a: CommonLineStartPattern, b: CommonLineStartPattern): number => {
        if (b.count !== a.count) {
            return b.count - a.count;
        }
        return compareSpecificityThenCount(a, b);
    };

    const sorted: CommonLineStartPattern[] = [...counts.entries()]
        .map(([pattern, v]) => ({ count: v.count, examples: v.examples, pattern }))
        .filter((p) => p.count >= o.minCount)
        .sort(o.sortBy === 'count' ? compareCountThenSpecificity : compareSpecificityThenCount);

    return sorted.slice(0, o.topK);
};
