import type { PageRange } from '.';

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
     *
     * Brackets `()[]` outside `{{tokens}}` are auto-escaped (like `template` patterns).
     * For raw regex with full control, use `regex` instead.
     *
     * If both `pattern` and `regex` are specified, `regex` takes precedence.
     */
    pattern?: string;

    /**
     * Raw regex pattern (supports token expansion, NO bracket auto-escaping).
     *
     * Use this when you need regex features like non-capturing groups `(?:...)`,
     * lookaheads, or character classes with parentheses.
     *
     * If both `pattern` and `regex` are specified, `regex` takes precedence.
     *
     * @example
     * // Non-capturing alternation (won't work in pattern due to auto-escaping)
     * { regex: '\\s+(?:ولهذا|وكذلك|فلذلك)', split: 'at' }
     */
    regex?: string;

    /**
     * Where to split relative to the match.
     * - `'at'`: New segment starts AT the match (previous segment does NOT include match)
     * - `'after'`: New segment starts AFTER the match (previous segment ENDS WITH match)
     *
     * **Note**: For empty pattern `''`, `split` is ignored (page boundary).
     * Invalid values are treated as `'after'`.
     *
     * @default 'after'
     */
    split?: 'at' | 'after';

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
