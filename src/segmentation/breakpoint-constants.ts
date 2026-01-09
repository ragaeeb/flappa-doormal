/**
 * Shared constants for segmentation breakpoint processing.
 */

/**
 * Threshold for using offset-based fast path in boundary processing.
 *
 * Below this: accurate string-search (handles offset drift from structural rules).
 * At or above this: O(n) arithmetic (performance critical for large books).
 *
 * The value of 1000 is chosen based on typical Arabic book sizes:
 * - Sahih al-Bukhari: ~1000-3000 pages
 * - Standard hadith collections: 1000-7000 pages
 * - Large aggregated corpora: 10k-50k pages
 *
 * For segments ≥1000 pages, the performance gain from offset-based slicing
 * outweighs the minor accuracy loss from potential offset drift.
 *
 * @remarks
 * Fast path is skipped when:
 * - `maxContentLength` is set (requires character-accurate splitting)
 * - `debugMetaKey` is set (requires proper provenance tracking)
 * - Content was structurally modified by marker stripping (offsets may drift)
 */
export const FAST_PATH_THRESHOLD = 1000;

export const WINDOW_PREFIX_LENGTHS = [80, 60, 40, 30, 20, 15] as const;

// For page-join normalization we need to handle cases where only the very beginning of the next page
// is present in the current segment (e.g. the segment ends right before the next structural marker).
// That can be as short as a few words, so we allow shorter prefixes here.
export const JOINER_PREFIX_LENGTHS = [80, 60, 40, 30, 20, 15, 12, 10, 8, 6] as const;

// Includes Arabic comma (،), semicolon (؛), full stop (.), etc.
export const STOP_CHARACTERS = /[\s\n.,;!?؛،۔]/;
