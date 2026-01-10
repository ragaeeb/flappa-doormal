import type { Breakpoint } from './breakpoints.js';
import type { SplitRule } from './rules.js';

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
     * Attach debugging provenance into `segment.meta` indicating which rule and/or breakpoint
     * created the segment boundary.
     *
     * This is opt-in because it increases output size.
     *
     * When enabled (default metaKey: `_flappa`), segments may include:
     * `meta._flappa.rule` and/or `meta._flappa.breakpoint`.
     */
    debug?:
        | boolean
        | {
              /** Where to store provenance in meta. @default '_flappa' */
              metaKey?: string;
              /** Which kinds of provenance to include. @default ['rule','breakpoint'] */
              include?: Array<'rule' | 'breakpoint'>;
          };

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
     * Maximum length (in characters) per segment.
     *
     * When a segment exceeds this length, breakpoints are applied to split it.
     * This can typically be used in conjunction with `maxPages`, where the
     * strictest constraint (intersection) determines the split window.
     *
     * @example
     * // Break segments that exceed 2000 chars
     * { maxContentLength: 2000, breakpoints: ['{{tarqim}}'] }
     */
    maxContentLength?: number;

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
