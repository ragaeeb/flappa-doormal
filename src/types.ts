/**
 * Numbering styles for markers
 */
export type NumberingStyle = 'arabic-indic' | 'latin';

/**
 * Separator styles for markers
 */
export type SeparatorStyle = 'dash' | 'dot' | 'paren' | 'colon' | 'none';

/**
 * Marker types for text segmentation
 */
export type MarkerType =
    | 'numbered'
    | 'bullet'
    | 'heading'
    | 'pattern' // Custom pattern
    // Preset types for common Arabic text patterns:
    | 'bab' // باب chapter markers
    | 'hadith-chain' // Hadith narrator chain patterns
    | 'basmala' // بسم الله patterns
    | 'phrase' // Configurable phrase starters
    | 'square-bracket' // [number] reference patterns
    // Numbered marker variants (common patterns):
    | 'num-letter' // ٥ أ - (number + Arabic letter + dash)
    | 'num-paren' // ٥ (أ) - (number + parenthetical + dash)
    | 'num-slash'; // ٥/٦ - (number / number + dash)

/**
 * Configuration for a single marker pattern
 */
export type MarkerConfig = {
    /** The type of marker to look for */
    type: MarkerType;
    /** For numbered markers, the digit style */
    numbering?: NumberingStyle;
    /** The separator that follows the marker */
    separator?: SeparatorStyle | string;
    /**
     * Template format for numbered markers using token syntax.
     * Example: '{bullet}+ {num} {dash}'
     * Only valid when type is 'numbered'.
     */
    format?: string;
    /**
     * For 'pattern' type, provide a template using tokens like {num}, {dash}, {bullet}.
     * For raw regex patterns that don't use templates, provide the raw pattern string here.
     * Example: '{bullet}? {num}+ {s}{dash}' or '^[•*°]? ([\\u0660-\\u0669]+\\s?[-–—ـ].*)'
     */
    template?: string;
    /**
     * Alternative to template: raw regex pattern string (for 'pattern' type only).
     * Use this for complex patterns that can't be expressed with templates.
     * The pattern should have a capture group for the content.
     * Example: '^CUSTOM: (.*)'
     */
    pattern?: string;
    /**
     * Custom token map for advanced users.
     * Extends the default TOKENS with additional definitions.
     */
    tokens?: Record<string, string>;
    /**
     * List of phrases for 'phrase' and 'hadith-chain' types.
     * For 'hadith-chain', defaults to common narrator patterns if not provided.
     */
    phrases?: string[];
    /**
     * Optional: Only apply this marker after a specific page number.
     * Useful for books with different formatting in front matter vs main content.
     */
    minPage?: number;
    /**
     * Optional: Arbitrary metadata to attach to entries matched by this marker.
     * This allows for agnostic handling of entry properties.
     * Example: { type: 0, category: 'hadith' }
     */
    metadata?: Record<string, any>;
};
