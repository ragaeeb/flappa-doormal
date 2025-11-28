/**
 * Default configuration values for marker patterns
 * All defaults are centralized here as a single source of truth
 */

import type { NumberingStyle, SeparatorStyle } from '../types.js';

/**
 * Default numbering style for markers
 */
export const DEFAULT_NUMBERING: NumberingStyle = 'arabic-indic';

/**
 * Default separator style for markers
 */
export const DEFAULT_SEPARATOR: SeparatorStyle = 'dash';

/**
 * Default separator pattern (used when separator is a custom string)
 */
export const DEFAULT_SEPARATOR_PATTERN = '[-–—ـ]';

/**
 * Numbering patterns mapped by style
 */
export const NUMBERING_PATTERNS: Record<NumberingStyle, string> = {
    'arabic-indic': '[\\u0660-\\u0669]+',
    'latin': '\\d+',
};

/**
 * Separator patterns mapped by style
 */
export const SEPARATOR_PATTERNS: Record<SeparatorStyle, string> = {
    'colon': ':',
    'dash': '[-–—ـ]',
    'dot': '\\.',
    'none': '',
    'paren': '\\)',
};
