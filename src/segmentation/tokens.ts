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
// ─────────────────────────────────────────────────────────────
// Auto-escaping for template patterns
// ─────────────────────────────────────────────────────────────

/**
 * Escapes regex metacharacters (parentheses and brackets) in template patterns,
 * but preserves content inside `{{...}}` token delimiters.
 *
 * This allows users to write intuitive patterns like `({{harf}}):` instead of
 * the verbose `\\({{harf}}\\):`. The escaping is applied BEFORE token expansion,
 * so tokens like `{{harf}}` which expand to `[أ-ي]` work correctly.
 *
 * @param pattern - Template pattern that may contain `()[]` and `{{tokens}}`
 * @returns Pattern with `()[]` escaped outside of `{{...}}` delimiters
 *
 * @example
 * escapeTemplateBrackets('({{harf}}): ')
 * // → '\\({{harf}}\\): '
 *
 * @example
 * escapeTemplateBrackets('[{{raqm}}] ')
 * // → '\\[{{raqm}}\\] '
 *
 * @example
 * escapeTemplateBrackets('{{harf}}')
 * // → '{{harf}}' (unchanged - no brackets outside tokens)
 */
export const escapeTemplateBrackets = (pattern: string): string => {
    // Match either a token ({{...}}) or a bracket character
    // Tokens are preserved as-is, brackets are escaped
    return pattern.replace(/(\{\{[^}]*\}\})|([()[\]])/g, (_match, token, bracket) => {
        if (token) {
            return token; // Leave tokens intact
        }
        return `\\${bracket}`; // Escape the bracket
    });
};

// ─────────────────────────────────────────────────────────────
// Base tokens - raw regex patterns (no template references)
// ─────────────────────────────────────────────────────────────

/**
 * Base token definitions mapping human-readable token names to regex patterns.
 *
 * These tokens contain raw regex patterns and do not reference other tokens.
 * For composite tokens that build on these, see `COMPOSITE_TOKENS`.
 *
 * @internal
 */
// IMPORTANT:
// - We include the Arabic-Indic digit `٤` as a rumuz code, but we do NOT match it when it's part of a larger number (e.g. "٣٤").
// - We intentionally do NOT match ASCII `4`.
// - For performance/clarity, the single-letter rumuz are represented as a character class.
const RUMUZ_SINGLE_LETTER = '[خرزيمنصسدفلتقع]';
const RUMUZ_FOUR = '(?<![\\u0660-\\u0669])٤(?![\\u0660-\\u0669])';
const RUMUZ_ATOM = `(?:خت|خغ|بخ|عخ|مق|مت|عس|سي|سن|كن|مد|قد|خد|فد|دل|كد|غد|صد|دت|تم|فق|دق|${RUMUZ_SINGLE_LETTER}|${RUMUZ_FOUR})`;
const RUMUZ_BLOCK = `${RUMUZ_ATOM}(?:\\s+${RUMUZ_ATOM})*`;

const BASE_TOKENS: Record<string, string> = {
    /**
     * Chapter marker - Arabic word for "chapter" (باب).
     *
     * Commonly used in hadith collections to mark chapter divisions.
     *
     * @example 'باب ما جاء في الصلاة' (Chapter on what came regarding prayer)
     */
    bab: 'باب',

    /**
     * Basmala pattern - Arabic invocation "In the name of Allah" (بسم الله).
     *
     * Matches the beginning of the basmala formula, commonly appearing
     * at the start of chapters, books, or documents.
     *
     * @example 'بسم الله الرحمن الرحيم' (In the name of Allah, the Most Gracious, the Most Merciful)
     */
    basmalah: ['بسم الله', '﷽'].join('|'),

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
    fasl: ['مسألة', 'فصل'].join('|'),

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
     * One or more Arabic letters separated by spaces - matches sequences like "د ت س ي ق".
     *
     * Useful for matching abbreviation *lists* that are encoded as single-letter tokens
     * separated by spaces.
     *
     * IMPORTANT:
     * - This token intentionally matches **single letters only** (with optional spacing).
     * - It does NOT match multi-letter rumuz like "سي" or "خت". For those, use `{{rumuz}}`.
     *
     * @example '{{harfs}}' matches 'د ت س ي ق' in '١١١٨ د ت س ي ق: حجاج'
     * @example '{{raqms:num}} {{harfs}}:' matches number + abbreviations + colon
     */
    // Example matches: "د ت س ي ق"
    // Example non-matches: "وعلامة ...", "في", "لا", "سي", "خت"
    harfs: '[أ-ي](?:\\s+[أ-ي])*',

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
    naql: ['حدثني', 'وأخبرنا', 'حدثنا', 'سمعت', 'أنبأنا', 'وحدثنا', 'أخبرنا'].join('|'),

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

    /**
     * Rumuz (source abbreviations) used in rijāl / takhrīj texts.
     *
     * This token matches the known abbreviation set used to denote sources like:
     * - All six books: (ع)
     * - The four Sunan: (٤)
     * - Bukhari: خ / خت / خغ / بخ / عخ / ز / ي
     * - Muslim: م / مق / مت
     * - Nasa'i: س / ن / ص / عس / سي / كن
     * - Abu Dawud: د / مد / قد / خد / ف / فد / ل / دل / كد / غد / صد
     * - Tirmidhi: ت / تم
     * - Ibn Majah: ق / فق
     *
     * Notes:
     * - Order matters: longer alternatives must come before shorter ones (e.g., "خد" before "خ")
     * - This token matches a rumuz *block*: one or more codes separated by whitespace
     *   (e.g., "خ سي", "خ فق", "خت ٤", "د ت سي ق")
     */
    rumuz: RUMUZ_BLOCK,

    /**
     * Punctuation characters.
     * Use {{tarqim}} which is especially useful when splitting using split: 'after' on punctuation marks.
     */
    tarqim: '[.!?؟؛]',
};

// ─────────────────────────────────────────────────────────────
// Composite tokens - templates that reference base tokens
// These are pre-expanded at module load time for performance
// ─────────────────────────────────────────────────────────────

/**
 * Composite token definitions using template syntax.
 *
 * These tokens reference base tokens using `{{token}}` syntax and are
 * automatically expanded to their final regex patterns at module load time.
 *
 * This provides better abstraction - if base tokens change, composites
 * automatically update on the next build.
 *
 * @internal
 */
const COMPOSITE_TOKENS: Record<string, string> = {
    /**
     * Numbered hadith marker - common format for hadith numbering.
     *
     * Matches patterns like "٢٢ - " (number, space, dash, space).
     * This is the most common format in hadith collections.
     *
     * Use with `lineStartsAfter` to cleanly extract hadith content:
     * ```typescript
     * { lineStartsAfter: ['{{numbered}}'], split: 'at' }
     * ```
     *
     * For capturing the hadith number, use explicit capture syntax:
     * ```typescript
     * { lineStartsAfter: ['{{raqms:hadithNum}} {{dash}} '], split: 'at' }
     * ```
     *
     * @example '٢٢ - حدثنا' matches, content starts after '٢٢ - '
     * @example '٦٦٩٦ – أخبرنا' matches (with en-dash)
     */
    numbered: '{{raqms}} {{dash}} ',
};

/**
 * Expands any *composite* tokens (like `{{numbered}}`) into their underlying template form
 * (like `{{raqms}} {{dash}} `).
 *
 * This is useful when you want to take a signature produced by `analyzeCommonLineStarts()`
 * and turn it into an editable template where you can add named captures, e.g.:
 *
 * - `{{numbered}}` → `{{raqms}} {{dash}} `
 * - then: `{{raqms:num}} {{dash}} ` to capture the number
 *
 * Notes:
 * - This only expands the plain `{{token}}` form (not `{{token:name}}`).
 * - Expansion is repeated a few times to support nested composites.
 */
export const expandCompositeTokensInTemplate = (template: string): string => {
    let out = template;
    for (let i = 0; i < 10; i++) {
        const next = out.replace(/\{\{(\w+)\}\}/g, (m, tokenName: string) => {
            const replacement = COMPOSITE_TOKENS[tokenName];
            return replacement ?? m;
        });
        if (next === out) {
            break;
        }
        out = next;
    }
    return out;
};

/**
 * Expands base tokens in a template string.
 * Used internally to pre-expand composite tokens.
 *
 * @param template - Template string with `{{token}}` placeholders
 * @returns Expanded pattern with base tokens replaced
 * @internal
 */
const expandBaseTokens = (template: string): string => {
    return template.replace(/\{\{(\w+)\}\}/g, (_, tokenName) => {
        return BASE_TOKENS[tokenName] ?? `{{${tokenName}}}`;
    });
};

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
 *
 * @example
 * // Using the numbered convenience token
 * { lineStartsAfter: ['{{numbered}}'], split: 'at' }
 */
export const TOKEN_PATTERNS: Record<string, string> = {
    ...BASE_TOKENS,
    // Pre-expand composite tokens at module load time
    ...Object.fromEntries(Object.entries(COMPOSITE_TOKENS).map(([k, v]) => [k, expandBaseTokens(v)])),
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

type TemplateSegment = { type: 'token' | 'text'; value: string };

const splitTemplateIntoSegments = (query: string): TemplateSegment[] => {
    const segments: TemplateSegment[] = [];
    let lastIndex = 0;
    TOKEN_WITH_CAPTURE_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;

    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop pattern
    while ((match = TOKEN_WITH_CAPTURE_REGEX.exec(query)) !== null) {
        if (match.index > lastIndex) {
            segments.push({ type: 'text', value: query.slice(lastIndex, match.index) });
        }
        segments.push({ type: 'token', value: match[0] });
        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < query.length) {
        segments.push({ type: 'text', value: query.slice(lastIndex) });
    }

    return segments;
};

const maybeApplyFuzzyToText = (text: string, fuzzyTransform?: (pattern: string) => string): string => {
    if (fuzzyTransform && /[\u0600-\u06FF]/u.test(text)) {
        return fuzzyTransform(text);
    }
    return text;
};

// NOTE: This intentionally preserves the previous behavior:
// it applies fuzzy per `|`-separated alternative (best-effort) to avoid corrupting regex metacharacters.
const maybeApplyFuzzyToTokenPattern = (tokenPattern: string, fuzzyTransform?: (pattern: string) => string): string => {
    if (!fuzzyTransform) {
        return tokenPattern;
    }
    return tokenPattern
        .split('|')
        .map((part) => (/[\u0600-\u06FF]/u.test(part) ? fuzzyTransform(part) : part))
        .join('|');
};

const parseTokenLiteral = (literal: string): { tokenName: string; captureName: string } | null => {
    TOKEN_WITH_CAPTURE_REGEX.lastIndex = 0;
    const tokenMatch = TOKEN_WITH_CAPTURE_REGEX.exec(literal);
    if (!tokenMatch) {
        return null;
    }
    const [, tokenName, captureName] = tokenMatch;
    return { captureName, tokenName };
};

const createCaptureRegistry = (capturePrefix?: string) => {
    const captureNames: string[] = [];
    const captureNameCounts = new Map<string, number>();

    const register = (baseName: string): string => {
        const count = captureNameCounts.get(baseName) ?? 0;
        captureNameCounts.set(baseName, count + 1);
        const uniqueName = count === 0 ? baseName : `${baseName}_${count + 1}`;
        const prefixedName = capturePrefix ? `${capturePrefix}${uniqueName}` : uniqueName;
        captureNames.push(prefixedName);
        return prefixedName;
    };

    return { captureNames, register };
};

const expandTokenLiteral = (
    literal: string,
    opts: {
        fuzzyTransform?: (pattern: string) => string;
        registerCapture: (baseName: string) => string;
        capturePrefix?: string;
    },
): string => {
    const parsed = parseTokenLiteral(literal);
    if (!parsed) {
        return literal;
    }

    const { tokenName, captureName } = parsed;

    // {{:name}} - capture anything with name
    if (!tokenName && captureName) {
        const name = opts.registerCapture(captureName);
        return `(?<${name}>.+)`;
    }

    let tokenPattern = TOKEN_PATTERNS[tokenName];
    if (!tokenPattern) {
        // Unknown token - leave as-is
        return literal;
    }

    tokenPattern = maybeApplyFuzzyToTokenPattern(tokenPattern, opts.fuzzyTransform);

    // {{token:name}} - capture with name
    if (captureName) {
        const name = opts.registerCapture(captureName);
        return `(?<${name}>${tokenPattern})`;
    }

    // {{token}} - no capture, just expand
    return tokenPattern;
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
export const expandTokensWithCaptures = (
    query: string,
    fuzzyTransform?: (pattern: string) => string,
    capturePrefix?: string,
): ExpandResult => {
    const segments = splitTemplateIntoSegments(query);
    const registry = createCaptureRegistry(capturePrefix);

    const processedParts = segments.map((segment) => {
        if (segment.type === 'text') {
            return maybeApplyFuzzyToText(segment.value, fuzzyTransform);
        }
        return expandTokenLiteral(segment.value, {
            capturePrefix,
            fuzzyTransform,
            registerCapture: registry.register,
        });
    });

    return {
        captureNames: registry.captureNames,
        hasCaptures: registry.captureNames.length > 0,
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
export const expandTokens = (query: string) => expandTokensWithCaptures(query).pattern;

/**
 * Converts a template string to a compiled RegExp.
 *
 * Expands all tokens and attempts to compile the result as a RegExp
 * with Unicode flag. Returns `null` if the resulting pattern is invalid.
 *
 * @remarks
 * This function dynamically compiles regular expressions from template strings.
 * If templates may come from untrusted sources, be aware of potential ReDoS
 * (Regular Expression Denial of Service) risks due to catastrophic backtracking.
 * Consider validating pattern complexity or applying execution timeouts when
 * running user-submitted patterns.
 *
 * @param template - Template string containing `{{token}}` placeholders
 * @returns Compiled RegExp with 'u' flag, or `null` if invalid
 *
 * @example
 * templateToRegex('، {{raqms}}')  // → /، [٠-٩]+/u
 * templateToRegex('{{raqms}}+')   // → /[٠-٩]++/u (might be invalid in some engines)
 * templateToRegex('(((')          // → null (invalid regex)
 */
export const templateToRegex = (template: string) => {
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
export const getAvailableTokens = () => Object.keys(TOKEN_PATTERNS);

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
