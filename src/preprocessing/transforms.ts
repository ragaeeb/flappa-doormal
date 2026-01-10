import type { PageRangeConstraint, PreprocessTransform } from '../types/index.js';

/**
 * Check if a character code is a zero-width control character.
 *
 * Covers:
 * - U+200B–U+200F (Zero Width Space, Joiners, Direction Marks)
 * - U+202A–U+202E (Bidirectional Formatting)
 * - U+2060–U+2064 (Word Joiner, Invisible Operators)
 * - U+FEFF (Byte Order Mark / Zero Width No-Break Space)
 */
export const isZeroWidth = (code: number): boolean =>
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2060 && code <= 0x2064) ||
    code === 0xfeff;

/**
 * Remove zero-width control characters from text.
 *
 * @param text - Input text
 * @param mode - 'strip' (default) removes entirely, 'space' replaces with space
 * @returns Text with zero-width characters removed or replaced
 */
export const removeZeroWidth = (text: string, mode: 'strip' | 'space' = 'strip'): string => {
    if (mode === 'space') {
        let result = '';
        let lastWasSpace = true; // Treat start as "after space" to avoid leading space
        for (let i = 0; i < text.length; i++) {
            const code = text.charCodeAt(i);
            if (isZeroWidth(code)) {
                if (!lastWasSpace && result.length > 0) {
                    result += ' ';
                    lastWasSpace = true;
                }
            } else {
                result += text[i];
                lastWasSpace = text[i] === ' ';
            }
        }
        return result;
    }
    return text.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, '');
};

/**
 * Condense multiple periods (...) into ellipsis character (…).
 *
 * Prevents `{{tarqim}}` from false-matching inside ellipsis since
 * the `.` in tarqim matches individual periods.
 *
 * @param text - Input text
 * @returns Text with period sequences replaced by ellipsis
 */
export const condenseEllipsis = (text: string): string => text.replace(/\.{2,}/g, '…');

/**
 * Join trailing و (waw) to the next word.
 *
 * Fixes OCR/digitization artifacts: ' و ' → ' و' (waw joined to next word)
 *
 * @param text - Input text
 * @returns Text with trailing waw joined to following word
 */
export const fixTrailingWaw = (text: string): string => text.replace(/ و /g, ' و');

/**
 * Check if a page ID is within a constraint range.
 */
const isInRange = (pageId: number, constraint: PageRangeConstraint): boolean => {
    if (constraint.min !== undefined && pageId < constraint.min) return false;
    if (constraint.max !== undefined && pageId > constraint.max) return false;
    return true;
};

/**
 * Normalize a transform to its object form.
 */
const normalizeTransform = (
    transform: PreprocessTransform,
): { type: 'removeZeroWidth' | 'condenseEllipsis' | 'fixTrailingWaw'; mode?: 'strip' | 'space'; min?: number; max?: number } => {
    if (typeof transform === 'string') {
        return { type: transform };
    }
    return transform;
};

/**
 * Apply preprocessing transforms to a page's content.
 *
 * Transforms run in array order. Each can be limited to specific pages
 * via `min`/`max` constraints.
 *
 * @param content - Page content to transform
 * @param pageId - Page ID for constraint checking
 * @param transforms - Array of transforms to apply
 * @returns Transformed content
 */
export const applyPreprocessToPage = (
    content: string,
    pageId: number,
    transforms: PreprocessTransform[],
): string => {
    let result = content;

    for (const transform of transforms) {
        const rule = normalizeTransform(transform);

        // Check page constraints
        if (!isInRange(pageId, rule)) continue;

        // Apply transform
        switch (rule.type) {
            case 'removeZeroWidth':
                result = removeZeroWidth(result, rule.mode ?? 'strip');
                break;
            case 'condenseEllipsis':
                result = condenseEllipsis(result);
                break;
            case 'fixTrailingWaw':
                result = fixTrailingWaw(result);
                break;
        }
    }

    return result;
};
