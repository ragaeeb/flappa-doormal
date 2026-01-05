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
