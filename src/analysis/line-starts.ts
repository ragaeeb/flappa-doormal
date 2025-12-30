// Line-starts analysis module

import { normalizeLineEndings } from '../segmentation/textUtils.js';
import type { Page } from '../segmentation/types.js';
import {
    appendWs,
    buildTokenPriority,
    type CompiledTokenRegex,
    collapseWhitespace,
    compileTokenRegexes,
    escapeSignatureLiteral,
    findBestTokenMatchAt,
    isArabicLetter,
    isCommonDelimiter,
    stripArabicDiacritics,
} from './shared.js';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type LineStartAnalysisOptions = {
    topK?: number;
    prefixChars?: number;
    minLineLength?: number;
    minCount?: number;
    maxExamples?: number;
    includeFirstWordFallback?: boolean;
    normalizeArabicDiacritics?: boolean;
    sortBy?: 'specificity' | 'count';
    lineFilter?: (line: string, pageId: number) => boolean;
    prefixMatchers?: RegExp[];
    whitespace?: 'regex' | 'space';
};

export type LineStartPatternExample = { line: string; pageId: number };

export type CommonLineStartPattern = {
    pattern: string;
    count: number;
    examples: LineStartPatternExample[];
};

// ─────────────────────────────────────────────────────────────
// Options resolution
// ─────────────────────────────────────────────────────────────

type ResolvedOptions = Required<Omit<LineStartAnalysisOptions, 'lineFilter'>> & {
    lineFilter?: LineStartAnalysisOptions['lineFilter'];
};

const resolveOptions = (options: LineStartAnalysisOptions = {}): ResolvedOptions => ({
    includeFirstWordFallback: options.includeFirstWordFallback ?? true,
    lineFilter: options.lineFilter,
    maxExamples: options.maxExamples ?? 1,
    minCount: options.minCount ?? 3,
    minLineLength: options.minLineLength ?? 6,
    normalizeArabicDiacritics: options.normalizeArabicDiacritics ?? true,
    prefixChars: options.prefixChars ?? 60,
    prefixMatchers: options.prefixMatchers ?? [/^#+/u],
    sortBy: options.sortBy ?? 'specificity',
    topK: options.topK ?? 40,
    whitespace: options.whitespace ?? 'regex',
});

// ─────────────────────────────────────────────────────────────
// Specificity & sorting
// ─────────────────────────────────────────────────────────────

const countTokenMarkers = (pattern: string): number => (pattern.match(/\{\{/g) ?? []).length;

const computeSpecificity = (pattern: string) => ({
    literalLen: pattern.replace(/\\s\*/g, '').replace(/[ \t]+/g, '').length,
    tokenCount: countTokenMarkers(pattern),
});

const compareBySpecificity = (a: CommonLineStartPattern, b: CommonLineStartPattern): number => {
    const sa = computeSpecificity(a.pattern),
        sb = computeSpecificity(b.pattern);
    return (
        sb.tokenCount - sa.tokenCount ||
        sb.literalLen - sa.literalLen ||
        b.count - a.count ||
        a.pattern.localeCompare(b.pattern)
    );
};

const compareByCount = (a: CommonLineStartPattern, b: CommonLineStartPattern): number =>
    b.count !== a.count ? b.count - a.count : compareBySpecificity(a, b);

// ─────────────────────────────────────────────────────────────
// Signature building helpers
// ─────────────────────────────────────────────────────────────

/** Remove trailing whitespace placeholders */
const trimTrailingWs = (out: string, mode: 'regex' | 'space'): string => {
    const suffix = mode === 'regex' ? '\\s*' : ' ';
    while (out.endsWith(suffix)) {
        out = out.slice(0, -suffix.length);
    }
    return out;
};

/** Try to extract first word for fallback */
const extractFirstWord = (s: string): string | null => (s.match(/^[^\s:،؛.?!؟]+/u) ?? [])[0] ?? null;

/** Consume prefix matchers at current position */
const consumePrefixes = (
    s: string,
    pos: number,
    out: string,
    matchers: RegExp[],
    ws: 'regex' | 'space',
): { pos: number; out: string; matched: boolean } => {
    let matched = false;
    for (const re of matchers) {
        if (pos >= s.length) {
            break;
        }
        const m = re.exec(s.slice(pos));
        if (!m?.index && m?.[0]) {
            out += escapeSignatureLiteral(m[0]);
            pos += m[0].length;
            matched = true;
            const wsm = /^[ \t]+/u.exec(s.slice(pos));
            if (wsm) {
                pos += wsm[0].length;
                out = appendWs(out, ws);
            }
        }
    }
    return { matched, out, pos };
};

/** Try to match a token at current position and append to signature */
const tryMatchToken = (
    s: string,
    pos: number,
    out: string,
    compiled: CompiledTokenRegex[],
): { pos: number; out: string; matched: boolean } => {
    const best = findBestTokenMatchAt(s, pos, compiled, isArabicLetter);
    if (!best) {
        return { matched: false, out, pos };
    }
    return { matched: true, out: `${out}{{${best.token}}}`, pos: pos + best.text.length };
};

/** Try to match a delimiter at current position */
const tryMatchDelimiter = (s: string, pos: number, out: string): { pos: number; out: string; matched: boolean } => {
    const ch = s[pos];
    if (!ch || !isCommonDelimiter(ch)) {
        return { matched: false, out, pos };
    }
    return { matched: true, out: out + escapeSignatureLiteral(ch), pos: pos + 1 };
};

/** Skip whitespace at position */
const skipWhitespace = (
    s: string,
    pos: number,
    out: string,
    ws: 'regex' | 'space',
): { pos: number; out: string; skipped: boolean } => {
    const m = /^[ \t]+/u.exec(s.slice(pos));
    if (!m) {
        return { out, pos, skipped: false };
    }
    return { out: appendWs(out, ws), pos: pos + m[0].length, skipped: true };
};

// ─────────────────────────────────────────────────────────────
// Main tokenization
// ─────────────────────────────────────────────────────────────

const tokenizeLineStart = (line: string, tokenNames: string[], opts: ResolvedOptions): string | null => {
    const trimmed = collapseWhitespace(line);
    if (!trimmed) {
        return null;
    }

    const s = (opts.normalizeArabicDiacritics ? stripArabicDiacritics(trimmed) : trimmed).slice(0, opts.prefixChars);
    const compiled = compileTokenRegexes(tokenNames);

    let pos = 0,
        out = '',
        matchedAny = false,
        matchedToken = false,
        steps = 0;

    // Consume prefixes
    const prefix = consumePrefixes(s, pos, out, opts.prefixMatchers, opts.whitespace);
    pos = prefix.pos;
    out = prefix.out;
    matchedAny = prefix.matched;

    while (steps < 6 && pos < s.length) {
        // Skip whitespace
        const ws = skipWhitespace(s, pos, out, opts.whitespace);
        if (ws.skipped) {
            pos = ws.pos;
            out = ws.out;
            continue;
        }

        // Try token
        const tok = tryMatchToken(s, pos, out, compiled);
        if (tok.matched) {
            pos = tok.pos;
            out = tok.out;
            matchedAny = matchedToken = true;
            steps++;
            continue;
        }

        // Try delimiter (only after matching something)
        if (matchedAny) {
            const delim = tryMatchDelimiter(s, pos, out);
            if (delim.matched) {
                pos = delim.pos;
                out = delim.out;
                continue;
            }
        }

        // Fallback logic
        if (matchedAny) {
            if (opts.includeFirstWordFallback && !matchedToken) {
                const word = extractFirstWord(s.slice(pos));
                if (word) {
                    out += escapeSignatureLiteral(word);
                    steps++;
                }
            }
            break;
        }

        if (!opts.includeFirstWordFallback) {
            return null;
        }

        const word = extractFirstWord(s.slice(pos));
        if (!word) {
            return null;
        }
        return escapeSignatureLiteral(word);
    }

    return matchedAny ? trimTrailingWs(out, opts.whitespace) : null;
};

// ─────────────────────────────────────────────────────────────
// Page processing
// ─────────────────────────────────────────────────────────────

type PatternAccumulator = Map<string, { count: number; examples: LineStartPatternExample[] }>;

const processLine = (
    line: string,
    pageId: number,
    tokenPriority: string[],
    opts: ResolvedOptions,
    acc: PatternAccumulator,
): void => {
    const trimmed = collapseWhitespace(line);
    if (trimmed.length < opts.minLineLength) {
        return;
    }
    if (opts.lineFilter && !opts.lineFilter(trimmed, pageId)) {
        return;
    }

    const sig = tokenizeLineStart(trimmed, tokenPriority, opts);
    if (!sig) {
        return;
    }

    const entry = acc.get(sig);
    if (!entry) {
        acc.set(sig, { count: 1, examples: [{ line: trimmed, pageId }] });
    } else {
        entry.count++;
        if (entry.examples.length < opts.maxExamples) {
            entry.examples.push({ line: trimmed, pageId });
        }
    }
};

const processPage = (page: Page, tokenPriority: string[], opts: ResolvedOptions, acc: PatternAccumulator): void => {
    for (const line of normalizeLineEndings(page.content ?? '').split('\n')) {
        processLine(line, page.id, tokenPriority, opts, acc);
    }
};

// ─────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────

/**
 * Analyze pages and return the most common line-start patterns (top K).
 */
export const analyzeCommonLineStarts = (
    pages: Page[],
    options: LineStartAnalysisOptions = {},
): CommonLineStartPattern[] => {
    const opts = resolveOptions(options);
    const tokenPriority = buildTokenPriority();
    const acc: PatternAccumulator = new Map();

    for (const page of pages) {
        processPage(page, tokenPriority, opts, acc);
    }

    const comparator = opts.sortBy === 'count' ? compareByCount : compareBySpecificity;

    return [...acc.entries()]
        .map(([pattern, v]) => ({ count: v.count, examples: v.examples, pattern }))
        .filter((p) => p.count >= opts.minCount)
        .sort(comparator)
        .slice(0, opts.topK);
};
