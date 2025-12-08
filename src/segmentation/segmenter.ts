/**
 * Core segmentation engine for splitting Arabic text pages into logical segments.
 *
 * The segmenter takes an array of pages and applies pattern-based rules to
 * identify split points, producing segments with content, page references,
 * and optional metadata.
 *
 * @module segmenter
 */

import { makeDiacriticInsensitive } from './fuzzy.js';
import {
    anyRuleAllowsId,
    extractNamedCaptures,
    filterByConstraints,
    filterByOccurrence,
    getLastPositionalCapture,
    groupBySpanAndFilter,
    type MatchResult,
} from './match-utils.js';
import { expandTokensWithCaptures } from './tokens.js';
import type { Page, Segment, SegmentationOptions, SplitRule } from './types.js';

/**
 * Normalizes line endings to Unix-style (`\n`).
 *
 * Converts Windows (`\r\n`) and old Mac (`\r`) line endings to Unix style
 * for consistent pattern matching across platforms.
 *
 * @param content - Raw content with potentially mixed line endings
 * @returns Content with all line endings normalized to `\n`
 */
const normalizeLineEndings = (content: string): string => content.replace(/\r\n?/g, '\n');

/**
 * Checks if a regex pattern contains standard (anonymous) capturing groups.
 *
 * Detects standard capturing groups `(...)` while excluding:
 * - Non-capturing groups `(?:...)`
 * - Lookahead assertions `(?=...)` and `(?!...)`
 * - Lookbehind assertions `(?<=...)` and `(?<!...)`
 * - Named groups `(?<name>...)` (start with `(?` so excluded here)
 *
 * **Note**: Named capture groups `(?<name>...)` ARE capturing groups but are
 * excluded by this check because they are tracked separately via the
 * `captureNames` array from token expansion. This function only detects
 * anonymous capturing groups like `(.*)`.
 *
 * @param pattern - Regex pattern string to analyze
 * @returns `true` if the pattern contains at least one anonymous capturing group
 */
const hasCapturingGroup = (pattern: string): boolean => {
    // Match ( that is NOT followed by ? (excludes non-capturing and named groups)
    return /\((?!\?)/.test(pattern);
};

/**
 * Result of processing a pattern with token expansion and optional fuzzy matching.
 */
type ProcessedPattern = {
    /** The expanded regex pattern string (tokens replaced with regex) */
    pattern: string;
    /** Names of captured groups extracted from `{{token:name}}` syntax */
    captureNames: string[];
};

/**
 * Processes a pattern string by expanding tokens and optionally applying fuzzy matching.
 *
 * Fuzzy matching makes Arabic text diacritic-insensitive. When enabled, the
 * transform is applied to token patterns BEFORE wrapping with capture groups,
 * ensuring regex metacharacters (`(`, `)`, `|`, etc.) are not corrupted.
 *
 * @param pattern - Pattern string potentially containing `{{token}}` placeholders
 * @param fuzzy - Whether to apply diacritic-insensitive transformation
 * @returns Processed pattern with expanded tokens and capture names
 *
 * @example
 * processPattern('{{raqms:num}} {{dash}}', false)
 * // → { pattern: '(?<num>[٠-٩]+) [-–—ـ]', captureNames: ['num'] }
 *
 * @example
 * processPattern('{{naql}}', true)
 * // → { pattern: 'حَ?دَّ?ثَ?نَ?ا|...', captureNames: [] }
 */
const processPattern = (pattern: string, fuzzy: boolean): ProcessedPattern => {
    // Pass fuzzy transform to expandTokensWithCaptures so it can apply to raw token patterns
    const fuzzyTransform = fuzzy ? makeDiacriticInsensitive : undefined;
    const { pattern: expanded, captureNames } = expandTokensWithCaptures(pattern, fuzzyTransform);
    return { captureNames, pattern: expanded };
};

/**
 * Compiled regex and metadata for a split rule.
 */
type RuleRegex = {
    /** Compiled RegExp with 'gmu' flags (global, multiline, unicode) */
    regex: RegExp;
    /** Whether the regex uses capturing groups for content extraction */
    usesCapture: boolean;
    /** Names of captured groups from `{{token:name}}` syntax */
    captureNames: string[];
    /** Whether this rule uses `lineStartsAfter` (content capture at end) */
    usesLineStartsAfter: boolean;
};

/**
 * Builds a compiled regex and metadata from a split rule.
 *
 * Handles all pattern types:
 * - `regex`: Used as-is (no token expansion)
 * - `template`: Tokens expanded via `expandTokensWithCaptures`
 * - `lineStartsWith`: Converted to `^(?:patterns...)`
 * - `lineStartsAfter`: Converted to `^(?:patterns...)(.*)`
 * - `lineEndsWith`: Converted to `(?:patterns...)$`
 *
 * @param rule - Split rule containing pattern and options
 * @returns Compiled regex with capture metadata
 */
const buildRuleRegex = (rule: SplitRule): RuleRegex => {
    const s: {
        lineStartsWith?: string[];
        lineStartsAfter?: string[];
        lineEndsWith?: string[];
        template?: string;
        regex?: string;
    } = { ...rule };

    const fuzzy = (rule as { fuzzy?: boolean }).fuzzy ?? false;
    let allCaptureNames: string[] = [];

    /**
     * Safely compiles a regex pattern, throwing a helpful error if invalid.
     */
    const compileRegex = (pattern: string): RegExp => {
        try {
            return new RegExp(pattern, 'gmu');
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Invalid regex pattern: ${pattern}\n  Cause: ${message}`);
        }
    };

    // lineStartsAfter: creates a capturing group to exclude the marker from content
    if (s.lineStartsAfter?.length) {
        const processed = s.lineStartsAfter.map((p) => processPattern(p, fuzzy));
        const patterns = processed.map((p) => p.pattern).join('|');
        allCaptureNames = processed.flatMap((p) => p.captureNames);
        // Wrap patterns with named captures in a non-capturing group, then capture rest
        s.regex = `^(?:${patterns})(.*)`;
        return {
            captureNames: allCaptureNames,
            regex: compileRegex(s.regex),
            usesCapture: true,
            usesLineStartsAfter: true,
        };
    }

    if (s.lineStartsWith?.length) {
        const processed = s.lineStartsWith.map((p) => processPattern(p, fuzzy));
        const patterns = processed.map((p) => p.pattern).join('|');
        allCaptureNames = processed.flatMap((p) => p.captureNames);
        s.template = `^(?:${patterns})`;
    }
    if (s.lineEndsWith?.length) {
        const processed = s.lineEndsWith.map((p) => processPattern(p, fuzzy));
        const patterns = processed.map((p) => p.pattern).join('|');
        allCaptureNames = processed.flatMap((p) => p.captureNames);
        s.template = `(?:${patterns})$`;
    }
    if (s.template) {
        // Template: expand tokens with captures
        const { pattern, captureNames } = expandTokensWithCaptures(s.template);
        s.regex = pattern;
        allCaptureNames = [...allCaptureNames, ...captureNames];
    }

    if (!s.regex) {
        throw new Error(
            'Rule must specify exactly one pattern type: regex, template, lineStartsWith, lineStartsAfter, or lineEndsWith',
        );
    }

    const usesCapture = hasCapturingGroup(s.regex) || allCaptureNames.length > 0;
    return {
        captureNames: allCaptureNames,
        regex: compileRegex(s.regex),
        usesCapture,
        usesLineStartsAfter: false,
    };
};

/**
 * Represents the byte offset boundaries of a single page within concatenated content.
 */
type PageBoundary = {
    /** Start offset (inclusive) in the concatenated content string */
    start: number;
    /** End offset (inclusive) in the concatenated content string */
    end: number;
    /** Page ID from the original `Page` */
    id: number;
};

/**
 * Page mapping utilities for tracking positions across concatenated pages.
 */
type PageMap = {
    /**
     * Returns the page ID for a given offset in the concatenated content.
     *
     * @param offset - Character offset in concatenated content
     * @returns Page ID containing that offset
     */
    getId: (offset: number) => number;
    /** Array of page boundaries in order */
    boundaries: PageBoundary[];
    /** Sorted array of offsets where page breaks occur (for binary search) */
    pageBreaks: number[];
};

/**
 * Builds a concatenated content string and page mapping from input pages.
 *
 * Pages are joined with newline characters, and a page map is created to
 * track which page each offset belongs to. This allows pattern matching
 * across page boundaries while preserving page reference information.
 *
 * @param pages - Array of input pages with id and content
 * @returns Concatenated content string and page mapping utilities
 *
 * @example
 * const pages = [
 *   { id: 1, content: 'Page 1 text' },
 *   { id: 2, content: 'Page 2 text' }
 * ];
 * const { content, pageMap } = buildPageMap(pages);
 * // content = 'Page 1 text\nPage 2 text'
 * // pageMap.getId(0) = 1
 * // pageMap.getId(12) = 2
 */
const buildPageMap = (pages: Page[]): { content: string; pageMap: PageMap } => {
    const boundaries: PageBoundary[] = [];
    const pageBreaks: number[] = []; // Sorted array for binary search
    let offset = 0;
    const parts: string[] = [];

    for (let i = 0; i < pages.length; i++) {
        const normalized = normalizeLineEndings(pages[i].content);
        boundaries.push({ end: offset + normalized.length, id: pages[i].id, start: offset });
        parts.push(normalized);
        if (i < pages.length - 1) {
            pageBreaks.push(offset + normalized.length); // Already in sorted order
            offset += normalized.length + 1;
        } else {
            offset += normalized.length;
        }
    }

    /**
     * Finds the page boundary containing the given offset using binary search.
     * O(log n) complexity for efficient lookup with many pages.
     *
     * @param off - Character offset to look up
     * @returns Page boundary or the last boundary as fallback
     */
    const findBoundary = (off: number): PageBoundary | undefined => {
        let lo = 0;
        let hi = boundaries.length - 1;

        while (lo <= hi) {
            const mid = (lo + hi) >>> 1; // Unsigned right shift for floor division
            const b = boundaries[mid];
            if (off < b.start) {
                hi = mid - 1;
            } else if (off > b.end) {
                lo = mid + 1;
            } else {
                return b;
            }
        }
        // Fallback to last boundary if not found
        return boundaries[boundaries.length - 1];
    };

    return {
        content: parts.join('\n'),
        pageMap: { boundaries, getId: (off: number) => findBoundary(off)?.id ?? 0, pageBreaks },
    };
};

/**
 * Represents a position where content should be split, with associated metadata.
 */
type SplitPoint = {
    /** Character index in the concatenated content where the split occurs */
    index: number;
    /** Static metadata from the matched rule */
    meta?: Record<string, unknown>;
    /** Content captured by `lineStartsAfter` patterns (rest of line after marker) */
    capturedContent?: string;
    /** Named captures from `{{token:name}}` patterns */
    namedCaptures?: Record<string, string>;
};

/**
 * Executes a regex against content and extracts match results with capture information.
 *
 * @param content - Full content string to search
 * @param regex - Compiled regex with 'g' flag
 * @param usesCapture - Whether to extract captured content
 * @param captureNames - Names of expected named capture groups
 * @returns Array of match results with positions and captures
 */
const findMatches = (content: string, regex: RegExp, usesCapture: boolean, captureNames: string[]): MatchResult[] => {
    const matches: MatchResult[] = [];
    regex.lastIndex = 0;
    let m = regex.exec(content);

    while (m !== null) {
        const result: MatchResult = { end: m.index + m[0].length, start: m.index };

        // Extract named captures if present
        result.namedCaptures = extractNamedCaptures(m.groups, captureNames);

        // For lineStartsAfter, get the last positional capture (the .* content)
        if (usesCapture) {
            result.captured = getLastPositionalCapture(m);
        }

        matches.push(result);

        if (m[0].length === 0) {
            regex.lastIndex++;
        }
        m = regex.exec(content);
    }

    return matches;
};

/**
 * Finds page breaks within a given offset range using binary search.
 * O(log n + k) where n = total breaks, k = breaks in range.
 *
 * @param startOffset - Start of range (inclusive)
 * @param endOffset - End of range (exclusive)
 * @param sortedBreaks - Sorted array of page break offsets
 * @returns Array of break offsets relative to startOffset
 */
const findBreaksInRange = (startOffset: number, endOffset: number, sortedBreaks: number[]): number[] => {
    if (sortedBreaks.length === 0) {
        return [];
    }

    // Binary search for first break >= startOffset
    let lo = 0;
    let hi = sortedBreaks.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (sortedBreaks[mid] < startOffset) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }

    // Collect breaks until we exceed endOffset
    const result: number[] = [];
    for (let i = lo; i < sortedBreaks.length && sortedBreaks[i] < endOffset; i++) {
        result.push(sortedBreaks[i] - startOffset);
    }
    return result;
};

/**
 * Converts page-break newlines to spaces in segment content.
 *
 * When a segment spans multiple pages, the newline characters that were
 * inserted as page separators during concatenation are converted to spaces
 * for more natural reading.
 *
 * Uses binary search for O(log n + k) lookup instead of O(n) iteration.
 *
 * @param content - Segment content string
 * @param startOffset - Starting offset of this content in concatenated string
 * @param pageBreaks - Sorted array of page break offsets
 * @returns Content with page-break newlines converted to spaces
 */
const convertPageBreaks = (content: string, startOffset: number, pageBreaks: number[]): string => {
    const endOffset = startOffset + content.length;
    const breaksInRange = findBreaksInRange(startOffset, endOffset, pageBreaks);

    // No page breaks in this segment - return as-is (most common case)
    if (breaksInRange.length === 0) {
        return content;
    }

    // Convert page-break newlines to spaces using array for efficiency
    const chars = Array.from(content);
    for (const idx of breaksInRange) {
        if (chars[idx] === '\n') {
            chars[idx] = ' ';
        }
    }
    return chars.join('');
};

/**
 * Segments pages of content based on pattern-matching rules.
 *
 * This is the main entry point for the segmentation engine. It takes an array
 * of pages and applies the provided rules to identify split points, producing
 * an array of segments with content, page references, and metadata.
 *
 * @param pages - Array of pages with id and content
 * @param options - Segmentation options including splitting rules
 * @returns Array of segments with content, from/to page references, and optional metadata
 *
 * @example
 * // Split markdown by headers
 * const segments = segmentPages(pages, {
 *   rules: [
 *     { lineStartsWith: ['## '], split: 'at', meta: { type: 'chapter' } }
 *   ]
 * });
 *
 * @example
 * // Split Arabic hadith text with number extraction
 * const segments = segmentPages(pages, {
 *   rules: [
 *     {
 *       lineStartsAfter: ['{{raqms:hadithNum}} {{dash}} '],
 *       split: 'at',
 *       fuzzy: true,
 *       meta: { type: 'hadith' }
 *     }
 *   ]
 * });
 *
 * @example
 * // Multiple rules with page constraints
 * const segments = segmentPages(pages, {
 *   rules: [
 *     { lineStartsWith: ['{{kitab}}'], split: 'at', meta: { type: 'book' } },
 *     { lineStartsWith: ['{{bab}}'], split: 'at', min: 10, meta: { type: 'chapter' } },
 *     { regex: '^[٠-٩]+ - ', split: 'at', meta: { type: 'hadith' } }
 *   ]
 * });
 */
export function segmentPages(pages: Page[], options: SegmentationOptions): Segment[] {
    const { rules = [] } = options;
    if (!rules.length || !pages.length) {
        return [];
    }

    const { content: matchContent, pageMap } = buildPageMap(pages);
    const splitPoints: SplitPoint[] = [];

    for (const rule of rules) {
        const { regex, usesCapture, captureNames } = buildRuleRegex(rule);
        const allMatches = findMatches(matchContent, regex, usesCapture, captureNames);

        // Filter matches by page ID constraints
        const constrainedMatches = filterByConstraints(allMatches, rule, pageMap.getId);

        // Apply occurrence filtering (per-span or global)
        const finalMatches =
            rule.maxSpan !== undefined && rule.maxSpan > 0
                ? groupBySpanAndFilter(constrainedMatches, rule.maxSpan, rule.occurrence, pageMap.getId)
                : filterByOccurrence(constrainedMatches, rule.occurrence);

        for (const m of finalMatches) {
            splitPoints.push({
                capturedContent: m.captured,
                index: rule.split === 'at' ? m.start : m.end,
                meta: rule.meta,
                namedCaptures: m.namedCaptures,
            });
        }
    }

    // Deduplicate split points by index using Set for O(1) lookup, then sort
    const seen = new Set<number>();
    const unique = splitPoints.filter((p) => {
        if (seen.has(p.index)) {
            return false;
        }
        seen.add(p.index);
        return true;
    });
    unique.sort((a, b) => a.index - b.index);

    return buildSegments(unique, matchContent, pageMap, rules);
}

/**
 * Creates segment objects from split points.
 *
 * Handles segment creation including:
 * - Content extraction (with captured content for `lineStartsAfter`)
 * - Page break conversion to spaces
 * - From/to page reference calculation
 * - Metadata merging (static + named captures)
 *
 * @param splitPoints - Sorted, unique split points
 * @param content - Full concatenated content string
 * @param pageMap - Page mapping utilities
 * @param rules - Original rules (for constraint checking on first segment)
 * @returns Array of segment objects
 */
function buildSegments(splitPoints: SplitPoint[], content: string, pageMap: PageMap, rules: SplitRule[]): Segment[] {
    const segments: Segment[] = [];

    /**
     * Creates a single segment from a content range.
     *
     * @param start - Start offset in content
     * @param end - End offset in content
     * @param meta - Static metadata from rule
     * @param capturedContent - Pre-captured content (for lineStartsAfter)
     * @param namedCaptures - Named capture group values
     * @returns Segment object or null if content is empty
     */
    const createSegment = (
        start: number,
        end: number,
        meta?: Record<string, unknown>,
        capturedContent?: string,
        namedCaptures?: Record<string, string>,
    ): Segment | null => {
        let text = capturedContent?.trim() ?? content.slice(start, end).replace(/[\s\n]+$/, '');
        if (!text) {
            return null;
        }
        if (!capturedContent) {
            text = convertPageBreaks(text, start, pageMap.pageBreaks);
        }
        const from = pageMap.getId(start);
        const to = capturedContent ? pageMap.getId(end - 1) : pageMap.getId(start + text.length - 1);
        const seg: Segment = { content: text, from };
        if (to !== from) {
            seg.to = to;
        }
        if (meta || namedCaptures) {
            seg.meta = { ...meta, ...namedCaptures };
        }
        return seg;
    };

    // Handle case with no split points
    if (!splitPoints.length) {
        const firstId = pageMap.getId(0);
        if (anyRuleAllowsId(rules, firstId)) {
            const s = createSegment(0, content.length);
            if (s) {
                segments.push(s);
            }
        }
        return segments;
    }

    // Add first segment if there's content before first split
    if (splitPoints[0].index > 0) {
        const firstId = pageMap.getId(0);
        if (anyRuleAllowsId(rules, firstId)) {
            const s = createSegment(0, splitPoints[0].index);
            if (s) {
                segments.push(s);
            }
        }
    }

    // Create segments from split points
    for (let i = 0; i < splitPoints.length; i++) {
        const start = splitPoints[i].index;
        const end = i < splitPoints.length - 1 ? splitPoints[i + 1].index : content.length;
        const s = createSegment(
            start,
            end,
            splitPoints[i].meta,
            splitPoints[i].capturedContent,
            splitPoints[i].namedCaptures,
        );
        if (s) {
            segments.push(s);
        }
    }

    return segments;
}
