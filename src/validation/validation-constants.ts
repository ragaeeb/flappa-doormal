/**
 * Validation-specific constants
 */

/**
 * Limit for validation issue preview length (characters).
 */
export const PREVIEW_LIMIT = 140;

/**
 * Threshold for short segment content (characters).
 * Segments shorter than this will trigger a full-document search fallback
 * if not found in the expected window.
 */
export const FULL_SEARCH_THRESHOLD = 500;
