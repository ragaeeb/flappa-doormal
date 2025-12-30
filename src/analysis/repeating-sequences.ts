// Repeating sequences analysis module

import type { Page } from '../segmentation/types.js';
import {
    buildTokenPriority,
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

export type TokenStreamItem = {
    type: 'token' | 'literal';
    /** The represented value (e.g. "{{naql}}" or "hello") */
    text: string;
    /** The original raw text (e.g. "حَدَّثَنَا") */
    raw: string;
    start: number;
    end: number;
};

export type RepeatingSequenceOptions = {
    minElements?: number;
    maxElements?: number;
    minCount?: number;
    topK?: number;
    normalizeArabicDiacritics?: boolean;
    requireToken?: boolean;
    whitespace?: 'regex' | 'space';
    maxExamples?: number;
    contextChars?: number;
    maxUniquePatterns?: number;
};

export type RepeatingSequenceExample = {
    text: string;
    context: string;
    pageId: number;
    startIndices: number[];
};

export type RepeatingSequencePattern = {
    pattern: string;
    count: number;
    examples: RepeatingSequenceExample[];
};

type PatternStats = {
    count: number;
    examples: RepeatingSequenceExample[];
    tokenCount: number;
    literalLen: number;
};

// ─────────────────────────────────────────────────────────────
// Resolved options with defaults
// ─────────────────────────────────────────────────────────────

type ResolvedOptions = Required<RepeatingSequenceOptions>;

const resolveOptions = (options?: RepeatingSequenceOptions): ResolvedOptions => {
    const minElements = Math.max(1, options?.minElements ?? 1);
    return {
        contextChars: options?.contextChars ?? 50,
        maxElements: Math.max(minElements, options?.maxElements ?? 3),
        maxExamples: options?.maxExamples ?? 3,
        maxUniquePatterns: options?.maxUniquePatterns ?? 1000,
        minCount: Math.max(1, options?.minCount ?? 3),
        minElements,
        normalizeArabicDiacritics: options?.normalizeArabicDiacritics ?? true,
        requireToken: options?.requireToken ?? true,
        topK: Math.max(1, options?.topK ?? 20),
        whitespace: options?.whitespace ?? 'regex',
    };
};

// ─────────────────────────────────────────────────────────────
// Raw position tracking for diacritic normalization
// ─────────────────────────────────────────────────────────────

/** Creates a cursor that tracks position in both normalized and raw text */
const createRawCursor = (text: string, normalize: boolean) => {
    let rawPos = 0;

    return {
        /** Advance cursor, returning the raw text chunk consumed */
        advance(normalizedLen: number): string {
            if (!normalize) {
                const chunk = text.slice(rawPos, rawPos + normalizedLen);
                rawPos += normalizedLen;
                return chunk;
            }

            const start = rawPos;
            let matchedLen = 0;

            // Match normalized characters
            while (matchedLen < normalizedLen && rawPos < text.length) {
                if (stripArabicDiacritics(text[rawPos]).length > 0) {
                    matchedLen++;
                }
                rawPos++;
            }

            // Consume trailing diacritics (belong to last character)
            while (rawPos < text.length && stripArabicDiacritics(text[rawPos]).length === 0) {
                rawPos++;
            }

            return text.slice(start, rawPos);
        },
        get pos() {
            return rawPos;
        },
    };
};

// ─────────────────────────────────────────────────────────────
// Token content scanner
// ─────────────────────────────────────────────────────────────

/** Scans text and produces a stream of tokens and literals. */
export const tokenizeContent = (text: string, normalize: boolean): TokenStreamItem[] => {
    const normalized = normalize ? stripArabicDiacritics(text) : text;
    const compiled = compileTokenRegexes(buildTokenPriority());
    const cursor = createRawCursor(text, normalize);
    const items: TokenStreamItem[] = [];
    let pos = 0;

    while (pos < normalized.length) {
        // Skip whitespace
        const ws = /^\s+/u.exec(normalized.slice(pos));
        if (ws) {
            pos += ws[0].length;
            cursor.advance(ws[0].length);
            continue;
        }

        // Try token
        const token = findBestTokenMatchAt(normalized, pos, compiled, isArabicLetter);
        if (token) {
            const raw = cursor.advance(token.text.length);
            items.push({
                end: cursor.pos,
                raw,
                start: cursor.pos - raw.length,
                text: `{{${token.token}}}`,
                type: 'token',
            });
            pos += token.text.length;
            continue;
        }

        // Try delimiter
        if (isCommonDelimiter(normalized[pos])) {
            const raw = cursor.advance(1);
            items.push({
                end: cursor.pos,
                raw,
                start: cursor.pos - 1,
                text: escapeSignatureLiteral(normalized[pos]),
                type: 'literal',
            });
            pos++;
            continue;
        }

        // Literal word
        const word = /^[^\s:：\-–—ـ،؛.?!؟()[\]{}]+/u.exec(normalized.slice(pos));
        if (word) {
            const raw = cursor.advance(word[0].length);
            items.push({
                end: cursor.pos,
                raw,
                start: cursor.pos - raw.length,
                text: escapeSignatureLiteral(word[0]),
                type: 'literal',
            });
            pos += word[0].length;
            continue;
        }

        cursor.advance(1);
        pos++;
    }

    return items;
};

// ─────────────────────────────────────────────────────────────
// N-gram pattern extraction
// ─────────────────────────────────────────────────────────────

/** Build pattern string from window items */
const buildPattern = (window: TokenStreamItem[], whitespace: 'regex' | 'space'): string =>
    window.map((i) => i.text).join(whitespace === 'space' ? ' ' : '\\s*');

/** Check if window contains at least one token */
const hasTokenInWindow = (window: TokenStreamItem[]): boolean => window.some((i) => i.type === 'token');

/** Compute token count and literal length for a window */
const computeWindowStats = (window: TokenStreamItem[]) => {
    let tokenCount = 0,
        literalLen = 0;
    for (const item of window) {
        if (item.type === 'token') {
            tokenCount++;
        } else {
            literalLen += item.text.length;
        }
    }
    return { literalLen, tokenCount };
};

/** Build example from page content and window */
const buildExample = (page: Page, window: TokenStreamItem[], contextChars: number): RepeatingSequenceExample => {
    const start = window[0].start;
    const end = window.at(-1)!.end;
    const ctxStart = Math.max(0, start - contextChars);
    const ctxEnd = Math.min(page.content.length, end + contextChars);

    return {
        context:
            (ctxStart > 0 ? '...' : '') +
            page.content.slice(ctxStart, ctxEnd) +
            (ctxEnd < page.content.length ? '...' : ''),
        pageId: page.id,
        startIndices: window.map((w) => w.start),
        text: page.content.slice(start, end),
    };
};

/** Extract N-grams from a single page */
const extractPageNgrams = (
    page: Page,
    items: TokenStreamItem[],
    opts: ResolvedOptions,
    stats: Map<string, PatternStats>,
): void => {
    for (let i = 0; i <= items.length - opts.minElements; i++) {
        for (let n = opts.minElements; n <= Math.min(opts.maxElements, items.length - i); n++) {
            const window = items.slice(i, i + n);

            if (opts.requireToken && !hasTokenInWindow(window)) {
                continue;
            }

            const pattern = buildPattern(window, opts.whitespace);

            if (!stats.has(pattern)) {
                if (stats.size >= opts.maxUniquePatterns) {
                    continue;
                }
                stats.set(pattern, { count: 0, examples: [], ...computeWindowStats(window) });
            }

            const entry = stats.get(pattern)!;
            entry.count++;

            if (entry.examples.length < opts.maxExamples) {
                entry.examples.push(buildExample(page, window, opts.contextChars));
            }
        }
    }
};

// ─────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────

/**
 * Analyze pages for commonly repeating word sequences.
 *
 * Use for continuous text without line breaks. For line-based analysis,
 * use `analyzeCommonLineStarts()` instead.
 */
export const analyzeRepeatingSequences = (
    pages: Page[],
    options?: RepeatingSequenceOptions,
): RepeatingSequencePattern[] => {
    const opts = resolveOptions(options);
    const stats = new Map<string, PatternStats>();

    for (const page of pages) {
        if (!page.content) {
            continue;
        }
        extractPageNgrams(page, tokenizeContent(page.content, opts.normalizeArabicDiacritics), opts, stats);
    }

    return [...stats.entries()]
        .filter(([, s]) => s.count >= opts.minCount)
        .sort(
            (a, b) => b[1].count - a[1].count || b[1].tokenCount - a[1].tokenCount || b[1].literalLen - a[1].literalLen,
        )
        .slice(0, opts.topK)
        .map(([pattern, s]) => ({ count: s.count, examples: s.examples, pattern }));
};
