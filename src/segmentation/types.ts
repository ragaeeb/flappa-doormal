// ─────────────────────────────────────────────────────────────
// Pattern Types (mutually exclusive - only ONE per rule)
// ─────────────────────────────────────────────────────────────

/**
 * Literal regex pattern rule - no token expansion or auto-escaping is applied.
 *
 * Use this when you need full control over the regex pattern, including:
 * - Character classes like `[أب]` to match أ or ب
 * - Capturing groups like `(test|text)` for alternation
 * - Any other regex syntax that would be escaped in template patterns
 *
 * If the regex contains capturing groups, the captured content
 * will be used as the segment content.
 *
 * **Note**: Unlike `template`, `lineStartsWith`, etc., this pattern type
 * does NOT auto-escape `()[]`. You have full regex control.
 *
 * @example
 * // Match Arabic-Indic numbers followed by a dash
 * { regex: '^[٠-٩]+ - ', split: 'at' }
 *
 * @example
 * // Character class - matches أ or ب
 * { regex: '^[أب] ', split: 'at' }
 *
 * @example
 * // Capture group - content after the marker becomes segment content
 * { regex: '^[٠-٩]+ - (.*)', split: 'at' }
 */
type RegexPattern = {
    /** Raw regex pattern string (no token expansion, no auto-escaping) */
    regex: string;
};

/**
 * Template pattern rule - expands `{{tokens}}` before compiling to regex.
 *
 * Supports all tokens defined in `TOKEN_PATTERNS` and named capture syntax.
 *
 * **Auto-escaping**: Parentheses `()` and square brackets `[]` outside of
 * `{{tokens}}` are automatically escaped. Write `({{harf}}):` instead of
 * `\\({{harf}}\\):`. For raw regex control, use `regex` pattern type.
 *
 * @example
 * // Using tokens for Arabic-Indic digits
 * { template: '^{{raqms}} {{dash}}', split: 'at' }
 *
 * @example
 * // Named capture to extract hadith number into metadata
 * { template: '^{{raqms:hadithNum}} {{dash}}', split: 'at' }
 *
 * @example
 * // Auto-escaped brackets - matches literal (أ):
 * { template: '^({{harf}}): ', split: 'at' }
 *
 * @see TOKEN_PATTERNS for available tokens
 */
type TemplatePattern = {
    /** Template string with `{{token}}` or `{{token:name}}` placeholders. Brackets `()[]` are auto-escaped. */
    template: string;
};

/**
 * Line-start pattern rule - matches lines starting with any of the given patterns.
 *
 * Syntactic sugar for `^(?:pattern1|pattern2|...)`. The matched marker
 * is **included** in the segment content.
 *
 * Token expansion is applied to each pattern. Use `fuzzy: true` for
 * diacritic-insensitive Arabic matching.
 *
 * **Auto-escaping**: Parentheses `()` and square brackets `[]` outside of
 * `{{tokens}}` are automatically escaped. Write `({{harf}})` instead of
 * `\\({{harf}}\\)`. For raw regex control, use `regex` pattern type.
 *
 * @example
 * // Split at chapter headings (marker included in content)
 * { lineStartsWith: ['## ', '### '], split: 'at' }
 *
 * @example
 * // Split at Arabic book/chapter markers with fuzzy matching
 * { lineStartsWith: ['{{kitab}}', '{{bab}}'], split: 'at', fuzzy: true }
 *
 * @example
 * // Auto-escaped brackets - matches literal (أ)
 * { lineStartsWith: ['({{harf}}) '], split: 'at' }
 */
type LineStartsWithPattern = {
    /** Array of patterns that mark line beginnings (marker included in content). Brackets `()[]` are auto-escaped. */
    lineStartsWith: string[];
};

/**
 * Line-start-after pattern rule - matches lines starting with patterns,
 * but **excludes** the marker from the segment content.
 *
 * Behaves like `lineStartsWith` but strips the marker from the output.
 * The segment content starts after the marker and extends to the next split point
 * (not just the end of the matching line).
 *
 * Token expansion is applied to each pattern. Use `fuzzy: true` for
 * diacritic-insensitive Arabic matching.
 *
 * **Auto-escaping**: Parentheses `()` and square brackets `[]` outside of
 * `{{tokens}}` are automatically escaped. Write `({{harf}}):` instead of
 * `\\({{harf}}\\):`. For raw regex control, use `regex` pattern type.
 *
 * @example
 * // Split at numbered hadiths, capturing content without the number prefix
 * // Content extends to next split, not just end of that line
 * { lineStartsAfter: ['{{raqms}} {{dash}} '], split: 'at' }
 *
 * @example
 * // Extract hadith number to metadata while stripping the prefix
 * { lineStartsAfter: ['{{raqms:num}} {{dash}} '], split: 'at' }
 *
 * @example
 * // Auto-escaped brackets - matches literal (أ): prefix
 * { lineStartsAfter: ['({{harf}}): '], split: 'at' }
 */
type LineStartsAfterPattern = {
    /** Array of patterns that mark line beginnings (marker excluded from content). Brackets `()[]` are auto-escaped. */
    lineStartsAfter: string[];
};

/**
 * Line-end pattern rule - matches lines ending with any of the given patterns.
 *
 * Syntactic sugar for `(?:pattern1|pattern2|...)$`.
 *
 * Token expansion is applied to each pattern. Use `fuzzy: true` for
 * diacritic-insensitive Arabic matching.
 *
 * **Auto-escaping**: Parentheses `()` and square brackets `[]` outside of
 * `{{tokens}}` are automatically escaped. For raw regex control, use `regex` pattern type.
 *
 * @example
 * // Split at lines ending with Arabic sentence-ending punctuation
 * { lineEndsWith: ['۔', '؟', '!'], split: 'after' }
 *
 * @example
 * // Auto-escaped brackets - matches literal (انتهى) suffix
 * { lineEndsWith: ['(انتهى)'], split: 'after' }
 */
type LineEndsWithPattern = {
    /** Array of patterns that mark line endings. Brackets `()[]` are auto-escaped. */
    lineEndsWith: string[];
};

/**
 * Union of all pattern types for split rules.
 *
 * Each rule must have exactly ONE pattern type:
 * - `regex` - Raw regex pattern (no token expansion)
 * - `template` - Pattern with `{{token}}` expansion
 * - `lineStartsWith` - Match line beginnings (marker included)
 * - `lineStartsAfter` - Match line beginnings (marker excluded)
 * - `lineEndsWith` - Match line endings
 */
type PatternType =
    | RegexPattern
    | TemplatePattern
    | LineStartsWithPattern
    | LineStartsAfterPattern
    | LineEndsWithPattern;

// ─────────────────────────────────────────────────────────────
// Split Behavior
// ─────────────────────────────────────────────────────────────

/**
 * Configuration for how and where to split content when a pattern matches.
 *
 * Controls the split position relative to matches, which occurrences to
 * split on, page span limits, and fuzzy matching for Arabic text.
 */
type SplitBehavior = {
    /**
     * Where to split relative to the match.
     * - `'at'`: New segment starts at the match position
     * - `'after'`: New segment starts after the match ends
     * @default 'at'
     */
    split?: 'at' | 'after';

    /**
     * Which occurrence(s) to split on.
     * - `'all'`: Split at every match (default)
     * - `'first'`: Only split at the first match
     * - `'last'`: Only split at the last match
     *
     * When `maxSpan` is set, occurrence filtering is applied per sliding
     * window rather than globally. With `'last'`, the algorithm prefers
     * longer segments by looking as far ahead as allowed before selecting
     * the last match in the window.
     *
     * @default 'all'
     */
    occurrence?: 'first' | 'last' | 'all';

    /**
     * Maximum page ID difference allowed when looking ahead for split points.
     *
     * Uses a sliding window algorithm that prefers longer segments:
     * 1. Start from the first page of the current segment
     * 2. Look for matches within pages where `pageId - startPageId <= maxSpan`
     * 3. Apply occurrence filter (e.g., 'last') to select a match
     * 4. Next window starts from the page after the match
     *
     * Examples:
     * - `maxSpan: 1` = look 1 page ahead (segments span at most 2 pages)
     * - `maxSpan: 2` = look 2 pages ahead (segments span at most 3 pages)
     * - `undefined` = no limit (entire content treated as one group)
     *
     * Note: With non-consecutive page IDs, the algorithm uses actual ID
     * difference, not array index. Pages 1 and 5 have a difference of 4.
     *
     * @example
     * // Split at last period, looking up to 1 page ahead
     * // Pages 1,2: split at page 2's last period
     * // Page 3: split at page 3's last period
     * { lineEndsWith: ['.'], split: 'after', occurrence: 'last', maxSpan: 1 }
     */
    maxSpan?: number;

    /**
     * Enable diacritic-insensitive matching for Arabic text.
     *
     * When `true`, patterns in `lineStartsWith`, `lineEndsWith`, and
     * `lineStartsAfter` are transformed to match text regardless of:
     * - Diacritics (harakat/tashkeel): فَتْحَة، ضَمَّة، كَسْرَة، etc.
     * - Character equivalences: ا/آ/أ/إ, ة/ه, ى/ي
     *
     * **Note**: Does NOT apply to `regex` or `template` patterns.
     * For templates, apply fuzzy manually using `makeDiacriticInsensitive()`.
     *
     * @default false
     */
    fuzzy?: boolean;
};

// ─────────────────────────────────────────────────────────────
// Page Range Types
// ─────────────────────────────────────────────────────────────

/**
 * A single page ID or a range of page IDs.
 *
 * - `number`: A single page ID
 * - `[number, number]`: A range from first to second (inclusive)
 *
 * @example
 * 5           // Single page 5
 * [10, 20]    // Pages 10 through 20 (inclusive)
 */
export type PageRange = number | [number, number];

// ─────────────────────────────────────────────────────────────
// Constraints & Metadata
// ─────────────────────────────────────────────────────────────

/**
 * Optional constraints and metadata for a split rule.
 *
 * Use constraints to limit which pages a rule applies to, and
 * metadata to attach arbitrary data to resulting segments.
 */
type RuleConstraints = {
    /**
     * Minimum page ID for this rule to apply.
     *
     * Matches on pages with `id < min` are ignored.
     *
     * @example
     * // Only apply rule starting from page 10
     * { min: 10, lineStartsWith: ['##'], split: 'before' }
     */
    min?: number;

    /**
     * Maximum page ID for this rule to apply.
     *
     * Matches on pages with `id > max` are ignored.
     *
     * @example
     * // Only apply rule up to page 100
     * { max: 100, lineStartsWith: ['##'], split: 'before' }
     */
    max?: number;

    /**
     * Specific pages or page ranges to exclude from this rule.
     *
     * Use this to skip the rule for specific pages without needing
     * to repeat the rule with different min/max values.
     *
     * @example
     * // Exclude specific pages
     * { exclude: [1, 2, 5] }
     *
     * @example
     * // Exclude page ranges
     * { exclude: [[1, 10], [50, 100]] }
     *
     * @example
     * // Mix single pages and ranges
     * { exclude: [1, [5, 10], 50] }
     */
    exclude?: PageRange[];

    /**
     * Arbitrary metadata attached to segments matching this rule.
     *
     * This metadata is merged with any named captures from the pattern.
     * Named captures (e.g., `{{raqms:num}}`) take precedence over
     * static metadata with the same key.
     *
     * @example
     * // Tag segments as chapters
     * { lineStartsWith: ['{{bab}}'], split: 'before', meta: { type: 'chapter' } }
     */
    meta?: Record<string, unknown>;

    /**
     * Fallback behavior when no matches are found within a maxSpan boundary.
     * - 'page': Create split points at page boundaries
     * - undefined: No fallback (current behavior)
     */
    fallback?: 'page';

    /**
     * Page-start guard: only allow this rule to match at the START of a page if the
     * previous page's last non-whitespace character matches this pattern.
     *
     * This is useful for avoiding false positives caused purely by page wrap.
     *
     * Example use-case:
     * - Split on `{{naql}}` at line starts (e.g. "أخبرنا ...")
     * - BUT if a new page starts with "أخبرنا ..." and the previous page did NOT
     *   end with sentence-ending punctuation, treat it as a continuation and do not split.
     *
     * Notes:
     * - This guard applies ONLY at page starts, not mid-page line starts.
     * - This is a template pattern (tokens allowed). It is checked against the LAST
     *   non-whitespace character of the previous page's content.
     *
     * @example
     * // Allow split at page start only if previous page ends with sentence punctuation
     * { lineStartsWith: ['{{naql}}'], fuzzy: true, pageStartGuard: '{{tarqim}}' }
     */
    pageStartGuard?: string;
};

// ─────────────────────────────────────────────────────────────
// Combined Rule Type
// ─────────────────────────────────────────────────────────────

/**
 * A complete split rule combining pattern, behavior, and constraints.
 *
 * Each rule must specify:
 * - **Pattern** (exactly one): `regex`, `template`, `lineStartsWith`,
 *   `lineStartsAfter`, or `lineEndsWith`
 * - **Split behavior**: `split` (optional, defaults to `'at'`), `occurrence`, `maxSpan`, `fuzzy`
 * - **Constraints** (optional): `min`, `max`, `meta`
 *
 * @example
 * // Basic rule: split at markdown headers (split defaults to 'at')
 * const rule: SplitRule = {
 *   lineStartsWith: ['## ', '### '],
 *   meta: { type: 'section' }
 * };
 *
 * @example
 * // Advanced rule: extract hadith numbers with fuzzy Arabic matching
 * const rule: SplitRule = {
 *   lineStartsAfter: ['{{raqms:hadithNum}} {{dash}} '],
 *   fuzzy: true,
 *   min: 5,
 *   max: 500,
 *   meta: { type: 'hadith' }
 * };
 */
export type SplitRule = PatternType & SplitBehavior & RuleConstraints;

// ─────────────────────────────────────────────────────────────
// Input & Output
// ─────────────────────────────────────────────────────────────

/**
 * Input page structure for segmentation.
 *
 * Each page represents a logical unit of content (e.g., a book page,
 * a document section) that can be tracked across segment boundaries.
 *
 * @example
 * const pages: Page[] = [
 *   { id: 1, content: '## Chapter 1\nFirst paragraph...' },
 *   { id: 2, content: 'Continued text...\n## Chapter 2' },
 * ];
 */
export type Page = {
    /**
     * Unique page/entry ID used for:
     * - `maxSpan` grouping (segments spanning multiple pages)
     * - `min`/`max` constraint filtering
     * - `from`/`to` tracking in output segments
     */
    id: number;

    /**
     * Raw page content (may contain HTML).
     *
     * Line endings are normalized internally (`\r\n` and `\r` → `\n`).
     * Use a utility to convert html to markdown or `stripHtmlTags()` to preprocess HTML.
     */
    content: string;
};

// ─────────────────────────────────────────────────────────────
// Breakpoint Types
// ─────────────────────────────────────────────────────────────

/**
 * A breakpoint pattern with optional page constraints.
 *
 * Use this to control which pages a breakpoint pattern applies to.
 * Patterns outside the specified range are skipped, allowing
 * the next breakpoint pattern (or fallback) to be tried.
 *
 * @example
 * // Only apply punctuation-based breaking from page 10 onwards
 * { pattern: '{{tarqim}}\\s*', min: 10 }
 *
 * @example
 * // Apply to specific page range (pages 10-50)
 * { pattern: '{{tarqim}}\\s*', min: 10, max: 50 }
 */
export type BreakpointRule = {
    /**
     * Regex pattern for breaking (supports token expansion).
     * Empty string `''` means fall back to page boundary.
     */
    pattern: string;

    /**
     * Minimum page ID for this breakpoint to apply.
     * Segments starting before this page skip this pattern.
     */
    min?: number;

    /**
     * Maximum page ID for this breakpoint to apply.
     * Segments starting after this page skip this pattern.
     */
    max?: number;

    /**
     * Specific pages or page ranges to exclude from this breakpoint.
     *
     * Use this to skip the breakpoint for specific pages without needing
     * to repeat the breakpoint with different min/max values.
     *
     * @example
     * // Exclude specific pages
     * { pattern: '\\.\\s*', exclude: [1, 2, 5] }
     *
     * @example
     * // Exclude page ranges (front matter pages 1-10)
     * { pattern: '{{tarqim}}\\s*', exclude: [[1, 10]] }
     *
     * @example
     * // Mix single pages and ranges
     * { pattern: '\\.\\s*', exclude: [1, [5, 10], 50] }
     */
    exclude?: PageRange[];

    /**
     * Skip this breakpoint if the segment content matches this pattern.
     *
     * Supports token expansion (e.g., `{{kitab}}`). When the segment's
     * remaining content matches this regex, the breakpoint pattern is
     * skipped and the next breakpoint in the array is tried.
     *
     * Useful for excluding title pages or front matter without needing
     * to specify explicit page ranges.
     *
     * @example
     * // Skip punctuation breakpoint for short content (likely titles)
     * { pattern: '{{tarqim}}\\s*', skipWhen: '^.{1,20}$' }
     *
     * @example
     * // Skip for content containing "kitab" (book) marker
     * { pattern: '\\.\\s*', skipWhen: '{{kitab}}' }
     */
    skipWhen?: string;
};

/**
 * A breakpoint can be a simple string pattern or an object with constraints.
 *
 * String breakpoints apply to all pages. Object breakpoints can specify
 * `min`/`max` to limit which pages they apply to.
 *
 * @example
 * // String (applies everywhere)
 * '{{tarqim}}\\s*'
 *
 * @example
 * // Object with constraints (only from page 10+)
 * { pattern: '{{tarqim}}\\s*', min: 10 }
 */
export type Breakpoint = string | BreakpointRule;

// ─────────────────────────────────────────────────────────────
// Logger Interface
// ─────────────────────────────────────────────────────────────

/**
 * Logger interface for custom logging implementations.
 *
 * All methods are optional - only implement the verbosity levels you need.
 * When no logger is provided, no logging overhead is incurred.
 *
 * Compatible with the Logger interface from ffmpeg-simplified and similar libraries.
 *
 * @example
 * // Simple console logger
 * const logger: Logger = {
 *   debug: console.debug,
 *   info: console.info,
 *   warn: console.warn,
 *   error: console.error,
 * };
 *
 * @example
 * // Production logger (only warnings and errors)
 * const prodLogger: Logger = {
 *   warn: (msg, ...args) => myLoggingService.warn(msg, args),
 *   error: (msg, ...args) => myLoggingService.error(msg, args),
 * };
 */
export interface Logger {
    /** Log a debug message (verbose debugging output) */
    debug?: (message: string, ...args: unknown[]) => void;
    /** Log an error message (critical failures) */
    error?: (message: string, ...args: unknown[]) => void;
    /** Log an informational message (key progress points) */
    info?: (message: string, ...args: unknown[]) => void;
    /** Log a trace message (extremely verbose, per-iteration details) */
    trace?: (message: string, ...args: unknown[]) => void;
    /** Log a warning message (potential issues) */
    warn?: (message: string, ...args: unknown[]) => void;
}

// ─────────────────────────────────────────────────────────────
// Segmentation Options
// ─────────────────────────────────────────────────────────────

/**
 * Segmentation options controlling how pages are split.
 *
 * @example
 * // Basic structural rules only
 * const options: SegmentationOptions = {
 *   rules: [
 *     { lineStartsWith: ['## '], split: 'at', meta: { type: 'chapter' } },
 *     { lineStartsWith: ['### '], split: 'at', meta: { type: 'section' } },
 *   ]
 * };
 *
 * @example
 * // With breakpoints for oversized segments
 * const options: SegmentationOptions = {
 *   rules: [{ lineStartsWith: ['{{fasl}}'], split: 'at' }],
 *   maxPages: 2,
 *   breakpoints: ['{{tarqim}}\\s*', '\\n', ''],
 *   prefer: 'longer'
 * };
 *
 * @example
 * // With custom logger for debugging
 * const options: SegmentationOptions = {
 *   rules: [...],
 *   logger: {
 *     debug: console.debug,
 *     info: console.info,
 *     warn: console.warn,
 *   }
 * };
 */
export type SegmentationOptions = {
    /**
     * Rules applied in order to find split points.
     *
     * All rules are evaluated against the content, and their matches
     * are combined to determine final split points. The first matching
     * rule's metadata is used for each segment.
     */
    rules?: SplitRule[];

    /**
     * Maximum pages per segment before breakpoints are applied.
     *
     * When a segment spans more pages than this limit, the `breakpoints`
     * patterns are tried (in order) to find a suitable break point within
     * the allowed window.
     *
     * Structural markers (from rules) always take precedence - segments
     * are only broken within their rule-defined boundaries, never across them.
     *
     * @example
     * // Break segments that exceed 2 pages
     * { maxPages: 2, breakpoints: ['{{tarqim}}', ''] }
     */
    maxPages?: number;

    /**
     * Patterns tried in order to break oversized segments.
     *
     * Each pattern is tried until one matches within the allowed page window.
     * Supports token expansion (e.g., `{{tarqim}}`). An empty string `''`
     * matches the page boundary (always succeeds as ultimate fallback).
     *
     * Patterns can be simple strings (apply everywhere) or objects with
     * `min`/`max` constraints to limit which pages they apply to.
     *
     * Patterns are checked in order - put preferred break styles first:
     * - `{{tarqim}}\\s*` - Break at sentence-ending punctuation
     * - `\\n` - Break at line breaks (useful for OCR content)
     * - `''` - Break at page boundary (always works)
     *
     * Only applied to segments exceeding `maxPages`.
     *
     * @example
     * // Simple patterns (backward compatible)
     * breakpoints: ['{{tarqim}}\\s*', '\\n', '']
     *
     * @example
     * // Object patterns with page constraints
     * breakpoints: [
     *   { pattern: '{{tarqim}}\\s*', min: 10 },  // Only from page 10+
     *   ''  // Fallback for pages 1-9
     * ]
     */
    breakpoints?: Breakpoint[];

    /**
     * When multiple matches exist for a breakpoint pattern, select:
     * - `'longer'` - Last match in window (prefers longer segments)
     * - `'shorter'` - First match in window (prefers shorter segments)
     *
     * @default 'longer'
     */
    prefer?: 'longer' | 'shorter';

    /**
     * How to join content across page boundaries in OUTPUT segments.
     *
     * Internally, pages are still concatenated with `\\n` for matching (multiline regex),
     * but when a segment spans multiple pages, the inserted page-boundary separator is
     * normalized for output.
     *
     * - `'space'`: Join pages with a single space (default)
     * - `'newline'`: Preserve page boundary as a newline
     *
     * @default 'space'
     */
    pageJoiner?: 'space' | 'newline';

    /**
     * Optional logger for debugging segmentation.
     *
     * Provide a logger to receive detailed information about the segmentation
     * process. Useful for debugging pattern matching, page tracking, and
     * breakpoint processing issues.
     *
     * When not provided, no logging overhead is incurred (methods are not called).
     *
     * Verbosity levels:
     * - `trace`: Per-iteration details (very verbose)
     * - `debug`: Detailed operation information
     * - `info`: Key progress points
     * - `warn`: Potential issues
     * - `error`: Critical failures
     *
     * @example
     * // Console logger for development
     * logger: {
     *   debug: console.debug,
     *   info: console.info,
     *   warn: console.warn,
     * }
     *
     * @example
     * // Custom logger integration
     * logger: {
     *   debug: (msg, ...args) => winston.debug(msg, { meta: args }),
     *   error: (msg, ...args) => winston.error(msg, { meta: args }),
     * }
     */
    logger?: Logger;
};

/**
 * Output segment produced by `segmentPages()`.
 *
 * Each segment contains extracted content, page references, and
 * optional metadata from the matched rule and captured groups.
 *
 * @example
 * // Simple segment on a single page
 * { content: '## Chapter 1\nIntroduction...', from: 1, meta: { type: 'chapter' } }
 *
 * @example
 * // Segment spanning pages 5-7 with captured hadith number
 * { content: 'Hadith text...', from: 5, to: 7, meta: { type: 'hadith', hadithNum: '٤٢' } }
 */
export type Segment = {
    /**
     * Segment content with:
     * - Leading/trailing whitespace trimmed
     * - Page breaks converted to spaces (for multi-page segments)
     * - Markers stripped (for `lineStartsAfter` patterns)
     */
    content: string;

    /**
     * Starting page ID (from `Page.id`).
     */
    from: number;

    /**
     * Ending page ID if segment spans multiple pages.
     *
     * Only present when the segment content extends across page boundaries.
     * When `undefined`, the segment is contained within a single page.
     */
    to?: number;

    /**
     * Combined metadata from:
     * 1. Rule's `meta` property (static metadata)
     * 2. Named captures from patterns (e.g., `{{raqms:num}}` → `{ num: '٤٢' }`)
     *
     * Named captures override static metadata with the same key.
     */
    meta?: Record<string, unknown>;
};
