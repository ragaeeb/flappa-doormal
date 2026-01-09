import { getAvailableTokens, TOKEN_PATTERNS } from './segmentation/tokens.js';

/**
 * Result of detecting a token pattern in text
 */
export type DetectedPattern = {
    /** Token name from TOKEN_PATTERNS (e.g., 'raqms', 'dash') */
    token: string;
    /** The matched text */
    match: string;
    /** Start index in the original text */
    index: number;
    /** End index (exclusive) */
    endIndex: number;
};

/**
 * Token detection order - more specific patterns first to avoid partial matches.
 * Example: 'raqms' before 'raqm' so "٣٤" matches 'raqms' not just the first digit.
 *
 * Tokens not in this list are appended in alphabetical order from TOKEN_PATTERNS.
 */
const TOKEN_PRIORITY_ORDER = [
    'basmalah', // Most specific - full phrase
    'kitab',
    'bab',
    'fasl',
    'naql',
    'rumuz', // Source abbreviations (e.g., "خت", "خ سي", "٤")
    'numbered', // Composite: raqms + dash
    'raqms', // Multiple digits before single digit
    'raqm',
    'tarqim',
    'bullet',
    'dash',
    'harf',
];

/**
 * Gets the token detection priority order.
 * Returns tokens in priority order, with any TOKEN_PATTERNS not in the priority list appended.
 */
const getTokenPriority = () => {
    const allTokens = getAvailableTokens();
    const prioritized = TOKEN_PRIORITY_ORDER.filter((t) => allTokens.includes(t));
    const remaining = allTokens.filter((t) => !TOKEN_PRIORITY_ORDER.includes(t)).sort();
    return [...prioritized, ...remaining];
};

const isRumuzStandalone = (text: string, startIndex: number, endIndex: number): boolean => {
    // We want rumuz to behave like a standalone marker (e.g. "س:" or "خت ٤:"),
    // not a substring match inside normal Arabic words (e.g. "إِبْرَاهِيم").
    const before = startIndex > 0 ? text[startIndex - 1] : '';
    const after = endIndex < text.length ? text[endIndex] : '';

    const isWhitespace = (ch: string): boolean => !!ch && /\s/u.test(ch);
    const isOpenBracket = (ch: string): boolean => !!ch && /[([{]/u.test(ch);
    const isRightDelimiter = (ch: string): boolean => !!ch && /[:：\-–—ـ،؛.?!؟)\]}]/u.test(ch);

    // Treat any Arabic-block codepoint (letters + diacritics + digits) as "wordy" context.
    // Unicode Script properties can classify some combining marks as "Inherited", so we avoid \p{Script=Arabic}.
    const isArabicWordy = (ch: string): boolean => !!ch && /[\u0600-\u06FF]/u.test(ch);

    const leftOk = !before || isWhitespace(before) || isOpenBracket(before) || !isArabicWordy(before);
    const rightOk = !after || isWhitespace(after) || isRightDelimiter(after) || !isArabicWordy(after);

    return leftOk && rightOk;
};

/**
 * Analyzes text and returns all detected token patterns with their positions.
 * Patterns are detected in priority order to avoid partial matches.
 *
 * @param text - The text to analyze for token patterns
 * @returns Array of detected patterns sorted by position
 *
 * @example
 * detectTokenPatterns("٣٤ - حدثنا")
 * // Returns: [
 * //   { token: 'raqms', match: '٣٤', index: 0, endIndex: 2 },
 * //   { token: 'dash', match: '-', index: 3, endIndex: 4 },
 * //   { token: 'naql', match: 'حدثنا', index: 5, endIndex: 10 }
 * // ]
 */
export const detectTokenPatterns = (text: string) => {
    if (!text) {
        return [];
    }

    const results: DetectedPattern[] = [];
    const coveredRanges: Array<[number, number]> = [];

    // Check if a position is already covered by a detected pattern
    const isPositionCovered = (start: number, end: number): boolean => {
        return coveredRanges.some(
            ([s, e]) => (start >= s && start < e) || (end > s && end <= e) || (start <= s && end >= e),
        );
    };

    // Process tokens in priority order
    for (const tokenName of getTokenPriority()) {
        const pattern = TOKEN_PATTERNS[tokenName];
        if (!pattern) {
            continue;
        }

        try {
            // Create a global regex to find all matches
            const regex = new RegExp(`(${pattern})`, 'gu');
            let match: RegExpExecArray | null;

            // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop pattern
            while ((match = regex.exec(text)) !== null) {
                const startIndex = match.index;
                const endIndex = startIndex + match[0].length;

                if (tokenName === 'rumuz' && !isRumuzStandalone(text, startIndex, endIndex)) {
                    continue;
                }

                // Skip if this range overlaps with an already detected pattern
                if (isPositionCovered(startIndex, endIndex)) {
                    continue;
                }

                results.push({ endIndex, index: startIndex, match: match[0], token: tokenName });

                coveredRanges.push([startIndex, endIndex]);
            }
        } catch {}
    }

    return results.sort((a, b) => a.index - b.index);
};

/**
 * Generates a template pattern from text using detected tokens.
 * Replaces matched portions with {{token}} syntax.
 *
 * @param text - Original text
 * @param detected - Array of detected patterns from detectTokenPatterns
 * @returns Template string with tokens, e.g., "{{raqms}} {{dash}} "
 *
 * @example
 * const detected = detectTokenPatterns("٣٤ - ");
 * generateTemplateFromText("٣٤ - ", detected);
 * // Returns: "{{raqms}} {{dash}} "
 */
export const generateTemplateFromText = (text: string, detected: DetectedPattern[]) => {
    if (!text || detected.length === 0) {
        return text;
    }

    // Build template by replacing detected patterns with tokens
    // Process in reverse order to preserve indices
    let template = text;
    const sortedByIndexDesc = [...detected].sort((a, b) => b.index - a.index);

    for (const d of sortedByIndexDesc) {
        template = `${template.slice(0, d.index)}{{${d.token}}}${template.slice(d.endIndex)}`;
    }

    return template;
};

/**
 * Determines the best pattern type for auto-generated rules based on detected patterns.
 *
 * @param detected - Array of detected patterns
 * @returns Suggested pattern type and whether to use fuzzy matching
 */
export const suggestPatternConfig = (
    detected: DetectedPattern[],
): { patternType: 'lineStartsWith' | 'lineStartsAfter'; fuzzy: boolean; metaType?: string } => {
    // Check if the detected patterns suggest a structural marker (chapter, book, etc.)
    const hasStructuralToken = detected.some((d) => ['basmalah', 'kitab', 'bab', 'fasl'].includes(d.token));

    // Check if the pattern is numbered (hadith-style)
    const hasNumberedPattern = detected.some((d) => ['raqms', 'raqm', 'numbered'].includes(d.token));

    // If it starts with a structural token, use lineStartsWith (keep marker in content)
    if (hasStructuralToken) {
        return {
            fuzzy: true,
            metaType: detected.find((d) => ['kitab', 'bab', 'fasl'].includes(d.token))?.token || 'chapter',
            patternType: 'lineStartsWith',
        };
    }

    // If it's a numbered pattern (like hadith numbers), use lineStartsAfter (strip prefix)
    if (hasNumberedPattern) {
        return { fuzzy: false, metaType: 'hadith', patternType: 'lineStartsAfter' };
    }

    // Default: use lineStartsAfter without fuzzy
    return { fuzzy: false, patternType: 'lineStartsAfter' };
};

/**
 * Analyzes text and generates a complete suggested rule configuration.
 *
 * @param text - Highlighted text from the page
 * @returns Suggested rule configuration or null if no patterns detected
 */
export const analyzeTextForRule = (
    text: string,
): {
    template: string;
    patternType: 'lineStartsWith' | 'lineStartsAfter';
    fuzzy: boolean;
    metaType?: string;
    detected: DetectedPattern[];
} | null => {
    const detected = detectTokenPatterns(text);

    if (detected.length === 0) {
        return null;
    }

    const template = generateTemplateFromText(text, detected);
    const config = suggestPatternConfig(detected);

    return { detected, template, ...config };
};
