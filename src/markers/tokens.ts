/**
 * Token definitions for pattern templates.
 * Tokens provide a readable alternative to raw regex patterns.
 */

/**
 * Standard tokens for building marker patterns.
 * Use these in templates like: '{num} {dash}' instead of '[\\u0660-\\u0669]+ [-–—ـ]'
 */
export const TOKENS = {
    // Special characters
    bullet: '[•*°]', // Bullet point variants
    colon: ':', // Colon
    comma: '،', // Arabic comma
    content: '(.*)', // Capture rest of line

    // Separators
    dash: '[-–—ـ]', // Various dash types
    dot: '\\.', // Period
    latin: '\\d+', // Latin numerals
    letter: '[أ-ي]', // Arabic letters
    // Numbers
    num: '[\\u0660-\\u0669]+', // Arabic-Indic numerals
    paren: '\\)', // Closing parenthesis
    s: '\\s?', // Optional whitespace
    slash: '/', // Forward slash

    // Structural
    space: '\\s+', // One or more whitespace
} as const;

export type TokenName = keyof typeof TOKENS;
export type TokenMap = Record<string, string>;
