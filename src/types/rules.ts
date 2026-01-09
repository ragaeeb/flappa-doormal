import type { PageRange } from './index.js';

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

/**
 * Pattern type key names for split rules.
 *
 * Use this array to dynamically iterate over pattern types in UIs,
 * or use the `PatternTypeKey` type for type-safe string unions.
 *
 * @example
 * // Build a dropdown/select in UI
 * PATTERN_TYPE_KEYS.map(key => <option value={key}>{key}</option>)
 *
 * @example
 * // Type-safe pattern key validation
 * const validateKey = (k: string): k is PatternTypeKey =>
 *   (PATTERN_TYPE_KEYS as readonly string[]).includes(k);
 */
export const PATTERN_TYPE_KEYS = ['lineStartsWith', 'lineStartsAfter', 'lineEndsWith', 'template', 'regex'] as const;

/**
 * String union of pattern type key names.
 *
 * Derived from `PATTERN_TYPE_KEYS` to stay in sync automatically.
 */
export type PatternTypeKey = (typeof PATTERN_TYPE_KEYS)[number];

// Split Behavior

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
     * @default 'all'
     */
    occurrence?: 'first' | 'last' | 'all';

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

// Combined Rule Type

/**
 * A complete split rule combining pattern, behavior, and constraints.
 *
 * Each rule must specify:
 * - **Pattern** (exactly one): `regex`, `template`, `lineStartsWith`,
 *   `lineStartsAfter`, or `lineEndsWith`
 * - **Split behavior**: `split` (optional, defaults to `'at'`), `occurrence`, `fuzzy`
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
