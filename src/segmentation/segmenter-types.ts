/**
 * Internal types shared by the segmenter implementation and its helper utilities.
 *
 * These are intentionally NOT exported from the library's public `src/index.ts`.
 * They exist to keep `segmenter.ts` readable while allowing focused unit tests.
 */

/**
 * Represents the byte offset boundaries of a single page within concatenated content.
 */
export type PageBoundary = {
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
export type PageMap = {
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
    /** Array of all page IDs in order (for sliding window algorithm) */
    pageIds: number[];
};

/**
 * Represents a position where content should be split, with associated metadata.
 */
export type SplitPoint = {
    /** Character index in the concatenated content where the split occurs */
    index: number;
    /** Static metadata from the matched rule */
    meta?: Record<string, unknown>;
    /** Rule index that produced this split point (for debugging/provenance) */
    ruleIndex?: number;
    /** Content captured by regex patterns with capturing groups */
    capturedContent?: string;
    /** Named captures from `{{token:name}}` patterns */
    namedCaptures?: Record<string, string>;
    /**
     * Offset from index where content actually starts (for lineStartsAfter).
     * If set, the segment content starts at `index + contentStartOffset`.
     * This allows excluding the marker from content while keeping the split index
     * at the match start so previous segment doesn't include the marker.
     */
    contentStartOffset?: number;
};


