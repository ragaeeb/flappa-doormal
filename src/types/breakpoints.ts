import type { PageRangeConstraintWithExclude } from '.';

/**
 * A breakpoint pattern with optional page constraints.
 *
 * Use this to control which pages a breakpoint pattern applies to.
 * Patterns outside the specified range are skipped, allowing
 * the next breakpoint pattern (or fallback) to be tried.
 *
 * @example
 * // Only apply punctuation-based breaking from page 10 onwards
 * { pattern: '{{tarqim}}', min: 10 }
 *
 * @example
 * // Apply to specific page range (pages 10-50)
 * { pattern: '{{tarqim}}', min: 10, max: 50 }
 *
 * @example
 * // Break at specific words (auto whitespace boundary, split:'at' default)
 * { words: ['فهذا', 'ثم', 'أقول'], min: 100 }
 */
export type BreakpointRule = PageRangeConstraintWithExclude & {
    /**
     * Regex pattern for breaking (supports token expansion).
     * Empty string `''` means fall back to page boundary.
     *
     * Brackets `()[]` outside `{{tokens}}` are auto-escaped (like `template` patterns).
     * For raw regex with full control, use `regex` instead.
     *
     * If both `pattern` and `regex` are specified, `regex` takes precedence.
     *
     * **Mutually exclusive** with `words`.
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
     * **Mutually exclusive** with `words`.
     *
     * @example
     * // Non-capturing alternation (won't work in pattern due to auto-escaping)
     * { regex: '\\s+(?:ولهذا|وكذلك|فلذلك)', split: 'at' }
     */
    regex?: string;

    /**
     * Array of words/phrases to break on with automatic whitespace boundary.
     *
     * Each word is:
     * - Trimmed of whitespace
     * - Escaped for regex metacharacters (except inside `{{tokens}}`)
     * - Token-expanded
     * - Wrapped in non-capturing group for alternation
     * - Sorted by length descending (longest match first)
     *
     * Generates regex: `\s+(?:word1|word2|...)`
     *
     * **Mutually exclusive** with `pattern` and `regex`.
     *
     * @default split: 'at' (when words is specified)
     *
     * @example
     * // Simple words
     * { words: ['فهذا', 'ثم', 'أقول'], min: 100 }
     *
     * @example
     * // With tokens
     * { words: ['{{naql}}', 'وكذلك'] }
     *
     * @example
     * // Override split behavior
     * { words: ['والله أعلم'], split: 'after' }
     */
    words?: string[];

    /**
     * Where to split relative to the match.
     * - `'at'`: New segment starts AT the match (previous segment does NOT include match)
     * - `'after'`: New segment starts AFTER the match (previous segment ENDS WITH match)
     *
     * **Note**: For empty pattern `''`, `split` is ignored (page boundary).
     * Invalid values are treated as `'after'`.
     *
     * @default 'after' (or 'at' when using `words`)
     */
    split?: 'at' | 'after';

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
     * { pattern: '{{tarqim}}', skipWhen: '^.{1,20}$' }
     *
     * @example
     * // Skip for content containing "kitab" (book) marker
     * { pattern: '\\.', skipWhen: '{{kitab}}' }
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
