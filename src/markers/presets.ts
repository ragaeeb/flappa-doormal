/**
 * Default phrase lists for preset marker types.
 * Export these so users can extend them.
 */

/**
 * Common hadith narrator phrases (diacritic-insensitive)
 * Users can extend: [...DEFAULT_HADITH_PHRASES, 'أَخْبَرَنِي']
 */
export const DEFAULT_HADITH_PHRASES = [
    'حَدَّثَنَا',
    'حدثنا',
    'أَخْبَرَنَا',
    'حدثني',
    'حدَّثني',
    'وحدثنا',
    'حُدِّثت عن',
    'وحَدَّثَنَا',
] as const;

/**
 * Common basmala patterns
 * Users can extend: [...DEFAULT_BASMALA_PATTERNS, 'customPattern']
 */
export const DEFAULT_BASMALA_PATTERNS = ['بسم الله', '\\[بسم', '\\[تم'] as const;
