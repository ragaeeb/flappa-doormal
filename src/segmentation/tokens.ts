/**
 * Token-based template system for Arabic text pattern matching.
 *
 * This module provides a human-readable way to define regex patterns using
 * `{{token}}` placeholders that expand to their regex equivalents. It supports
 * named capture groups for extracting matched values into metadata.
 *
 * @module tokens
 *
 * @example
 * // Simple token expansion
 * expandTokens('{{raqms}} {{dash}}')
 * // → '[\\u0660-\\u0669]+ [-–—ـ]'
 *
 * @example
 * // Named capture groups
 * expandTokensWithCaptures('{{raqms:num}} {{dash}}')
 * // → { pattern: '(?<num>[\\u0660-\\u0669]+) [-–—ـ]', captureNames: ['num'], hasCaptures: true }
 */

/**
 * Token definitions mapping human-readable token names to regex patterns.
 *
 * Tokens are used in template strings with double-brace syntax:
 * - `{{token}}` - Expands to the pattern (non-capturing in context)
 * - `{{token:name}}` - Expands to a named capture group `(?<name>pattern)`
 * - `{{:name}}` - Captures any content with the given name `(?<name>.+)`
 *
 * @remarks
 * These patterns are designed for Arabic text matching. For diacritic-insensitive
 * matching of Arabic patterns, use the `fuzzy: true` option in split rules,
 * which applies `makeDiacriticInsensitive()` to the expanded patterns.
 *
 * @example
 * // Using tokens in a split rule
 * { lineStartsWith: ['{{kitab}}', '{{bab}}'], split: 'at', fuzzy: true }
 *
 * @example
 * // Using tokens with named captures
 * { lineStartsAfter: ['{{raqms:hadithNum}} {{dash}} '], split: 'at' }
 */
export const TOKEN_PATTERNS: Record<string, string> = {
    /**
     * Chapter marker - Arabic word for "chapter" (باب).
     *
     * Commonly used in hadith collections to mark chapter divisions.
     *
     * @example 'باب ما جاء في الصلاة' (Chapter on what came regarding prayer)
     */
    bab: 'باب',

    // ─────────────────────────────────────────────────────────────
    // Phrase group tokens (expand to alternations)
    // These are base forms - use fuzzy: true for diacritic-insensitive matching
    // ─────────────────────────────────────────────────────────────

    /**
     * Basmala pattern - Arabic invocation "In the name of Allah" (بسم الله).
     *
     * Matches the beginning of the basmala formula, commonly appearing
     * at the start of chapters, books, or documents.
     *
     * @example 'بسم الله الرحمن الرحيم' (In the name of Allah, the Most Gracious, the Most Merciful)
     */
    basmala: 'بسم الله',

    // ─────────────────────────────────────────────────────────────
    // Character patterns
    // ─────────────────────────────────────────────────────────────

    /**
     * Bullet point variants - common bullet characters.
     *
     * Character class matching: `•` (bullet), `*` (asterisk), `°` (degree).
     *
     * @example '• First item'
     */
    bullet: '[•*°]',

    /**
     * Dash variants - various dash and separator characters.
     *
     * Character class matching:
     * - `-` (hyphen-minus U+002D)
     * - `–` (en-dash U+2013)
     * - `—` (em-dash U+2014)
     * - `ـ` (tatweel U+0640, Arabic elongation character)
     *
     * @example '٦٦٩٦ - حدثنا' or '٦٦٩٦ ـ حدثنا'
     */
    dash: '[-–—ـ]',

    /**
     * Section marker - Arabic word for "section/issue".
     * Commonly used for fiqh books.
     */
    fasl: 'فصل|مسألة',

    /**
     * Single Arabic letter - matches any Arabic letter character.
     *
     * Character range from أ (alef with hamza) to ي (ya).
     * Does NOT include diacritics (harakat/tashkeel).
     *
     * @example '{{harf}}' matches 'ب' in 'باب'
     */
    harf: '[أ-ي]',

    /**
     * Book marker - Arabic word for "book" (كتاب).
     *
     * Commonly used in hadith collections to mark major book divisions.
     *
     * @example 'كتاب الإيمان' (Book of Faith)
     */
    kitab: 'كتاب',

    /**
     * Naql (transmission) phrases - common hadith transmission phrases.
     *
     * Alternation of Arabic phrases used to indicate narration chains:
     * - حدثنا (he narrated to us)
     * - أخبرنا (he informed us)
     * - حدثني (he narrated to me)
     * - وحدثنا (and he narrated to us)
     * - أنبأنا (he reported to us)
     * - سمعت (I heard)
     *
     * @example '{{naql}}' matches any of the above phrases
     */
    naql: 'حدثنا|أخبرنا|حدثني|وحدثنا|أنبأنا|سمعت',

    /**
     * Single Arabic-Indic digit - matches one digit (٠-٩).
     *
     * Unicode range: U+0660 to U+0669 (Arabic-Indic digits).
     * Use `{{raqms}}` for one or more digits.
     *
     * @example '{{raqm}}' matches '٥' in '٥ - '
     */
    raqm: '[\\u0660-\\u0669]',

    /**
     * One or more Arabic-Indic digits - matches digit sequences (٠-٩)+.
     *
     * Unicode range: U+0660 to U+0669 (Arabic-Indic digits).
     * Commonly used for hadith numbers, verse numbers, etc.
     *
     * @example '{{raqms}}' matches '٦٦٩٦' in '٦٦٩٦ - حدثنا'
     */
    raqms: '[\\u0660-\\u0669]+',
};

/**
 * Regex pattern for matching tokens with optional named capture syntax.
 *
 * Matches:
 * - `{{token}}` - Simple token (group 1 = token name, group 2 = empty)
 * - `{{token:name}}` - Token with capture (group 1 = token, group 2 = name)
 * - `{{:name}}` - Capture-only (group 1 = empty, group 2 = name)
 *
 * @internal
 */
const TOKEN_WITH_CAPTURE_REGEX = /\{\{(\w*):?(\w*)\}\}/g;

/**
 * Regex pattern for simple token matching (no capture syntax).
 *
 * Matches only `{{token}}` format where token is one or more word characters.
 * Used by `containsTokens()` for quick detection.
 *
 * @internal
 */
const SIMPLE_TOKEN_REGEX = /\{\{(\w+)\}\}/g;

/**
 * Checks if a query string contains template tokens.
 *
 * Performs a quick test for `{{token}}` patterns without actually
 * expanding them. Useful for determining whether to apply token
 * expansion to a string.
 *
 * @param query - String to check for tokens
 * @returns `true` if the string contains at least one `{{token}}` pattern
 *
 * @example
 * containsTokens('{{raqms}} {{dash}}') // → true
 * containsTokens('plain text')          // → false
 * containsTokens('[٠-٩]+ - ')           // → false (raw regex, no tokens)
 */
export const containsTokens = (query: string): boolean => {
    SIMPLE_TOKEN_REGEX.lastIndex = 0;
    return SIMPLE_TOKEN_REGEX.test(query);
};

/**
 * Result from expanding tokens with capture information.
 *
 * Contains the expanded pattern string along with metadata about
 * any named capture groups that were created.
 */
export type ExpandResult = {
    /**
     * The expanded regex pattern string with all tokens replaced.
     *
     * Named captures use the `(?<name>pattern)` syntax.
     */
    pattern: string;

    /**
     * Names of captured groups extracted from `{{token:name}}` syntax.
     *
     * Empty array if no named captures were found.
     */
    captureNames: string[];

    /**
     * Whether the pattern has any named capturing groups.
     *
     * Equivalent to `captureNames.length > 0`.
     */
    hasCaptures: boolean;
};

/**
 * Expands template tokens with support for named captures.
 *
 * This is the primary token expansion function that handles all token syntax:
 * - `{{token}}` → Expands to the token's pattern (no capture group)
 * - `{{token:name}}` → Expands to `(?<name>pattern)` (named capture)
 * - `{{:name}}` → Expands to `(?<name>.+)` (capture anything)
 *
 * Unknown tokens are left as-is in the output, allowing for partial templates.
 *
 * @param query - The template string containing tokens
 * @param fuzzyTransform - Optional function to transform Arabic text for fuzzy matching.
 *                         Applied to both token patterns and plain Arabic text between tokens.
 *                         Typically `makeDiacriticInsensitive` from the fuzzy module.
 * @returns Object with expanded pattern, capture names, and capture flag
 *
 * @example
 * // Simple token expansion
 * expandTokensWithCaptures('{{raqms}} {{dash}}')
 * // → { pattern: '[\\u0660-\\u0669]+ [-–—ـ]', captureNames: [], hasCaptures: false }
 *
 * @example
 * // Named capture
 * expandTokensWithCaptures('{{raqms:num}} {{dash}}')
 * // → { pattern: '(?<num>[\\u0660-\\u0669]+) [-–—ـ]', captureNames: ['num'], hasCaptures: true }
 *
 * @example
 * // Capture-only token
 * expandTokensWithCaptures('{{raqms:num}} {{dash}} {{:content}}')
 * // → { pattern: '(?<num>[٠-٩]+) [-–—ـ] (?<content>.+)', captureNames: ['num', 'content'], hasCaptures: true }
 *
 * @example
 * // With fuzzy transform
 * expandTokensWithCaptures('{{bab}}', makeDiacriticInsensitive)
 * // → { pattern: 'بَ?ا?بٌ?', captureNames: [], hasCaptures: false }
 */
export const expandTokensWithCaptures = (query: string, fuzzyTransform?: (pattern: string) => string): ExpandResult => {
    const captureNames: string[] = [];

    // Split the query into token matches and non-token segments
    const segments: Array<{ type: 'token' | 'text'; value: string }> = [];
    let lastIndex = 0;
    TOKEN_WITH_CAPTURE_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;

    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop pattern
    while ((match = TOKEN_WITH_CAPTURE_REGEX.exec(query)) !== null) {
        // Add text before this token
        if (match.index > lastIndex) {
            segments.push({ type: 'text', value: query.slice(lastIndex, match.index) });
        }
        // Add the token
        segments.push({ type: 'token', value: match[0] });
        lastIndex = match.index + match[0].length;
    }
    // Add remaining text after last token
    if (lastIndex < query.length) {
        segments.push({ type: 'text', value: query.slice(lastIndex) });
    }

    // Process each segment
    const processedParts = segments.map((segment) => {
        if (segment.type === 'text') {
            // Plain text - apply fuzzy if it contains Arabic and fuzzyTransform is provided
            if (fuzzyTransform && /[\u0600-\u06FF]/.test(segment.value)) {
                return fuzzyTransform(segment.value);
            }
            return segment.value;
        }

        // Token - extract tokenName and captureName
        TOKEN_WITH_CAPTURE_REGEX.lastIndex = 0;
        const tokenMatch = TOKEN_WITH_CAPTURE_REGEX.exec(segment.value);
        if (!tokenMatch) {
            return segment.value;
        }

        const [, tokenName, captureName] = tokenMatch;

        // {{:name}} - capture anything with name
        if (!tokenName && captureName) {
            captureNames.push(captureName);
            return `(?<${captureName}>.+)`;
        }

        // Get the token pattern
        let tokenPattern = TOKEN_PATTERNS[tokenName];
        if (!tokenPattern) {
            // Unknown token - leave as-is
            return segment.value;
        }

        // Apply fuzzy transform to the token pattern
        if (fuzzyTransform) {
            // For tokens with alternation, apply fuzzy to each alternative
            tokenPattern = tokenPattern
                .split('|')
                .map((part) => (/[\u0600-\u06FF]/.test(part) ? fuzzyTransform(part) : part))
                .join('|');
        }

        // {{token:name}} - capture with name
        if (captureName) {
            captureNames.push(captureName);
            return `(?<${captureName}>${tokenPattern})`;
        }

        // {{token}} - no capture, just expand
        return tokenPattern;
    });

    return {
        captureNames,
        hasCaptures: captureNames.length > 0,
        pattern: processedParts.join(''),
    };
};

/**
 * Expands template tokens in a query string to their regex equivalents.
 *
 * This is the simple version without capture support. It returns only the
 * expanded pattern string, not capture metadata.
 *
 * Unknown tokens are left as-is, allowing for partial templates.
 *
 * @param query - Template string containing `{{token}}` placeholders
 * @returns Expanded regex pattern string
 *
 * @example
 * expandTokens('، {{raqms}}')     // → '، [\\u0660-\\u0669]+'
 * expandTokens('{{raqm}}*')       // → '[\\u0660-\\u0669]*'
 * expandTokens('{{dash}}{{raqm}}') // → '[-–—ـ][\\u0660-\\u0669]'
 * expandTokens('{{unknown}}')     // → '{{unknown}}' (left as-is)
 *
 * @see expandTokensWithCaptures for full capture group support
 */
export const expandTokens = (query: string): string => expandTokensWithCaptures(query).pattern;

/**
 * Converts a template string to a compiled RegExp.
 *
 * Expands all tokens and attempts to compile the result as a RegExp
 * with Unicode flag. Returns `null` if the resulting pattern is invalid.
 *
 * @param template - Template string containing `{{token}}` placeholders
 * @returns Compiled RegExp with 'u' flag, or `null` if invalid
 *
 * @example
 * templateToRegex('، {{raqms}}')  // → /، [٠-٩]+/u
 * templateToRegex('{{raqms}}+')   // → /[٠-٩]++/u (might be invalid in some engines)
 * templateToRegex('(((')          // → null (invalid regex)
 */
export const templateToRegex = (template: string): RegExp | null => {
    const expanded = expandTokens(template);
    try {
        return new RegExp(expanded, 'u');
    } catch {
        return null;
    }
};

/**
 * Lists all available token names defined in `TOKEN_PATTERNS`.
 *
 * Useful for documentation, validation, or building user interfaces
 * that show available tokens.
 *
 * @returns Array of token names (e.g., `['bab', 'basmala', 'bullet', ...]`)
 *
 * @example
 * getAvailableTokens()
 * // → ['bab', 'basmala', 'bullet', 'dash', 'harf', 'kitab', 'naql', 'raqm', 'raqms']
 */
export const getAvailableTokens = (): string[] => Object.keys(TOKEN_PATTERNS);

/**
 * Gets the regex pattern for a specific token name.
 *
 * Returns the raw pattern string as defined in `TOKEN_PATTERNS`,
 * without any expansion or capture group wrapping.
 *
 * @param tokenName - The token name to look up (e.g., 'raqms', 'dash')
 * @returns The regex pattern string, or `undefined` if token doesn't exist
 *
 * @example
 * getTokenPattern('raqms')   // → '[\\u0660-\\u0669]+'
 * getTokenPattern('dash')    // → '[-–—ـ]'
 * getTokenPattern('unknown') // → undefined
 */
export const getTokenPattern = (tokenName: string): string | undefined => TOKEN_PATTERNS[tokenName];
