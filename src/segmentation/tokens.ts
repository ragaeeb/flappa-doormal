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
// - Single-letter codes must NOT be followed by Arabic diacritics (\u064B-\u0652, \u0670) or letters (أ-ي),
//   otherwise we'd incorrectly match the first letter of Arabic words like عَن as rumuz ع.
const RUMUZ_SINGLE_LETTER = '[خرزيمنصسدفلتقع](?![\\u064B-\\u0652\\u0670أ-ي])';

const RUMUZ_FOUR = '(?<![\\u0660-\\u0669])٤(?![\\u0660-\\u0669])';

// IMPORTANT: order matters. Put longer/more specific codes before shorter ones.
const RUMUZ_ATOMS: string[] = [
    // Multi-letter word codes (must NOT be followed by diacritics or letters)
    'تمييز(?![\\u064B-\\u0652\\u0670أ-ي])',
    // 2-letter codes
    'خت',
    'خغ',
    'بخ',
    'عخ',
    'مق',
    'مت',
    'عس',
    'سي',
    'سن',
    'كن',
    'مد',
    'قد',
    'خد',
    'فد',
    'دل',
    'كد',
    'غد',
    'صد',
    'دت',
    'دس',
    'تم',
    'فق',
    'دق',
    // Single-letter codes (character class) + special digit atom
    RUMUZ_SINGLE_LETTER,
    RUMUZ_FOUR,
];

const RUMUZ_ATOM = `(?:${RUMUZ_ATOMS.join('|')})`;

const RUMUZ_BLOCK = `${RUMUZ_ATOM}(?:\\s+${RUMUZ_ATOM})*`;

const BASE_TOKENS: Record<string, string> = {
    /** Chapter marker (باب). */
    bab: 'باب',

    /** Basmala (بسم الله). Also matches ﷽. */
    basmalah: ['بسم الله', '﷽'].join('|'),

    /** Bullet point variants: `•`, `*`, `°`. */
    bullet: '[•*°]',

    /** Dash variants: `-` (U+002D), `–` (U+2013), `—` (U+2014), `ـ` (tatweel U+0640). */
    dash: '[-–—ـ]',

    /** Section marker (فصل / مسألة). */
    fasl: ['مسألة', 'فصل'].join('|'),

    /** Single Arabic letter (أ-ي). Does NOT include diacritics. */
    harf: '[أ-ي]',

    /** One or more single Arabic letters separated by spaces. For multi-letter codes use `{{rumuz}}`. */
    harfs: '[أ-ي](?:\\s+[أ-ي])*',

    /** Horizontal rule / separator: 5+ repeated dashes, underscores, equals, or tatweels. Mixed allowed. */
    hr: '[-–—ـ_=]{5,}',

    /** Book marker (كتاب). */
    kitab: 'كتاب',

    /** Hadith transmission phrases (حدثنا, أخبرنا, حدثني, etc.). */
    naql: ['حدثني', 'وأخبرنا', 'حدثنا', 'سمعت', 'أنبأنا', 'وحدثنا', 'أخبرنا', 'وحدثني', 'وحدثنيه'].join('|'),

    /** Newline character. Useful for breakpoints that split on line boundaries. */
    newline: '\\n',

    /** Single ASCII digit (0-9). */
    num: '\\d',

    /** One or more ASCII digits (0-9)+. */
    nums: '\\d+',

    /** Single Arabic-Indic digit (٠-٩, U+0660-U+0669). */
    raqm: '[\\u0660-\\u0669]',

    /** One or more Arabic-Indic digits (٠-٩)+. */
    raqms: '[\\u0660-\\u0669]+',

    /** Rijāl/takhrīj source abbreviations. Matches one or more codes separated by whitespace. */
    rumuz: RUMUZ_BLOCK,

    /** Arabic/common punctuation: `.`, `!`, `?`, `؟`, `؛`. */
    tarqim: '[.!?؟؛]',
};

/** Pre-defined token constants for use in patterns. */
export const Token = {
    /** Chapter marker - باب */
    BAB: '{{bab}}',
    /** Basmala - بسم الله */
    BASMALAH: '{{basmalah}}',
    /** Bullet point variants */
    BULLET: '{{bullet}}',
    /** Dash variants (hyphen, en-dash, em-dash, tatweel) */
    DASH: '{{dash}}',
    /** Section marker - فصل / مسألة */
    FASL: '{{fasl}}',
    /** Single Arabic letter */
    HARF: '{{harf}}',
    /** Multiple Arabic letters separated by spaces */
    HARFS: '{{harfs}}',
    /** Horizontal rule / separator (repeated dashes) */
    HR: '{{hr}}',
    /** Book marker - كتاب */
    KITAB: '{{kitab}}',
    /** Hadith transmission phrases */
    NAQL: '{{naql}}',
    /** Newline character (for breakpoints) */
    NEWLINE: '{{newline}}',
    /** Single ASCII digit */
    NUM: '{{num}}',
    /** Composite: {{raqms}} {{dash}} (space) */
    NUMBERED: '{{numbered}}',
    /** One or more ASCII digits */
    NUMS: '{{nums}}',
    /** Single Arabic-Indic digit */
    RAQM: '{{raqm}}',
    /** One or more Arabic-Indic digits */
    RAQMS: '{{raqms}}',
    /** Source abbreviations (rijāl/takhrīj) */
    RUMUZ: '{{rumuz}}',
    /** Punctuation marks */
    TARQIM: '{{tarqim}}',
} as const;

/**
 * Type representing valid token constant keys.
 */
export type TokenKey = keyof typeof Token;

/** Wraps a token constant with a named capture: `{{token}}` → `{{token:name}}`. */
export const withCapture = (token: string, name: string): string => {
    // Extract token name from {{token}} format
    const match = token.match(/^\{\{(\w+)\}\}$/);
    if (!match) {
        // If not a valid token format, return capture-only syntax
        return `{{:${name}}}`;
    }
    return `{{${match[1]}:${name}}}`;
};

/** Composite tokens that reference base tokens. Pre-expanded at load time. @internal */
const COMPOSITE_TOKENS: Record<string, string> = {
    /** Common hadith numbering format: Arabic-Indic digits + dash + space. */
    numbered: '{{raqms}} {{dash}} ',
};

/** Expands composite tokens (e.g. `{{numbered}}`) to their underlying template form. */
export const expandCompositeTokensInTemplate = (template: string) => {
    let out = template;
    for (let i = 0; i < 10; i++) {
        const next = out.replace(/\{\{(\w+)\}\}/g, (m, tokenName: string) => COMPOSITE_TOKENS[tokenName] ?? m);
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
const expandBaseTokens = (template: string) =>
    template.replace(/\{\{(\w+)\}\}/g, (_, tokenName) => BASE_TOKENS[tokenName] ?? `{{${tokenName}}}`);

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
export const containsTokens = (query: string) => {
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

const splitTemplateIntoSegments = (query: string) => {
    const segments: TemplateSegment[] = [];
    let lastIndex = 0;
    TOKEN_WITH_CAPTURE_REGEX.lastIndex = 0;

    for (const match of query.matchAll(TOKEN_WITH_CAPTURE_REGEX)) {
        if (match.index! > lastIndex) {
            segments.push({ type: 'text', value: query.slice(lastIndex, match.index) });
        }
        segments.push({ type: 'token', value: match[0] });
        lastIndex = match.index! + match[0].length;
    }

    if (lastIndex < query.length) {
        segments.push({ type: 'text', value: query.slice(lastIndex) });
    }
    return segments;
};

const maybeApplyFuzzyToText = (text: string, fuzzyTransform?: (pattern: string) => string) =>
    fuzzyTransform && /[\u0600-\u06FF]/u.test(text) ? fuzzyTransform(text) : text;

// NOTE: This intentionally preserves the previous behavior:
// it applies fuzzy per `|`-separated alternative (best-effort) to avoid corrupting regex metacharacters.
const maybeApplyFuzzyToTokenPattern = (tokenPattern: string, fuzzyTransform?: (pattern: string) => string) =>
    !fuzzyTransform
        ? tokenPattern
        : tokenPattern
              .split('|')
              .map((part) => (/[\u0600-\u06FF]/u.test(part) ? fuzzyTransform(part) : part))
              .join('|');

const parseTokenLiteral = (literal: string) => {
    TOKEN_WITH_CAPTURE_REGEX.lastIndex = 0;
    const m = TOKEN_WITH_CAPTURE_REGEX.exec(literal);
    return m ? { captureName: m[2], tokenName: m[1] } : null;
};

const createCaptureRegistry = (capturePrefix?: string) => {
    const captureNames: string[] = [];
    const captureNameCounts = new Map<string, number>();

    const register = (baseName: string) => {
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
) => {
    const parsed = parseTokenLiteral(literal);
    if (!parsed) {
        return literal;
    }

    const { tokenName, captureName } = parsed;
    if (!tokenName && captureName) {
        return `(?<${opts.registerCapture(captureName)}>.+)`;
    }

    let tokenPattern = TOKEN_PATTERNS[tokenName];
    if (!tokenPattern) {
        return literal;
    }

    tokenPattern = maybeApplyFuzzyToTokenPattern(tokenPattern, opts.fuzzyTransform);
    if (captureName) {
        return `(?<${opts.registerCapture(captureName)}>${tokenPattern})`;
    }

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
) => {
    const segments = splitTemplateIntoSegments(query);
    const registry = createCaptureRegistry(capturePrefix);

    const pattern = segments
        .map((segment) =>
            segment.type === 'text'
                ? maybeApplyFuzzyToText(segment.value, fuzzyTransform)
                : expandTokenLiteral(segment.value, {
                      capturePrefix,
                      fuzzyTransform,
                      registerCapture: registry.register,
                  }),
        )
        .join('');

    return {
        captureNames: registry.captureNames,
        hasCaptures: registry.captureNames.length > 0,
        pattern,
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
export const getTokenPattern = (tokenName: string) => TOKEN_PATTERNS[tokenName];

/**
 * Tokens that should default to fuzzy matching when used in rules.
 *
 * These are Arabic phrase tokens where diacritic-insensitive matching
 * is almost always desired. Users can still override with `fuzzy: false`.
 */
const FUZZY_DEFAULT_TOKENS: (keyof typeof BASE_TOKENS)[] = ['bab', 'basmalah', 'fasl', 'kitab', 'naql'];

/**
 * Regex to detect fuzzy-default tokens in a pattern string.
 * Matches {{token}} or {{token:name}} syntax.
 */
const FUZZY_TOKEN_REGEX = new RegExp(`\\{\\{(?:${FUZZY_DEFAULT_TOKENS.join('|')})(?::\\w+)?\\}\\}`, 'g');

/**
 * Checks if a pattern (or array of patterns) contains tokens that should
 * default to fuzzy matching.
 *
 * Fuzzy-default tokens are: bab, basmalah, fasl, kitab, naql
 *
 * @param patterns - Single pattern string or array of pattern strings
 * @returns `true` if any pattern contains a fuzzy-default token
 *
 * @example
 * shouldDefaultToFuzzy('{{bab}} الإيمان')     // true
 * shouldDefaultToFuzzy('{{raqms}} {{dash}}')  // false
 * shouldDefaultToFuzzy(['{{kitab}}', '{{raqms}}']) // true
 */
export const shouldDefaultToFuzzy = (patterns: string | string[]) => {
    const arr = Array.isArray(patterns) ? patterns : [patterns];
    return arr.some((p) => {
        FUZZY_TOKEN_REGEX.lastIndex = 0;
        return FUZZY_TOKEN_REGEX.test(p);
    });
};

/**
 * Structure for mapping a token to a capture name.
 */
export type TokenMapping = { token: string; name: string };

/**
 * Apply token mappings to a template string.
 *
 * Transforms `{{token}}` into `{{token:name}}` based on the provided mappings.
 * Useful for applying user-configured capture names to a raw template.
 *
 * - Only affects exact matches of `{{token}}`.
 * - Does NOT affect tokens that already have a capture name (e.g. `{{token:existing}}`).
 * - Does NOT affect capture-only tokens (e.g. `{{:name}}`).
 *
 * @param template - The template string to transform
 * @param mappings - Array of mappings from token name to capture name
 * @returns Transformed template string with captures applied
 *
 * @example
 * applyTokenMappings('{{raqms}} {{dash}}', [{ token: 'raqms', name: 'num' }])
 * // → '{{raqms:num}} {{dash}}'
 */
export const applyTokenMappings = (template: string, mappings: TokenMapping[]): string => {
    let result = template;
    for (const { token, name } of mappings) {
        if (!token || !name) {
            continue;
        }
        // Match {{token}} but ensure it doesn't already have a suffix like :name
        // We use a regex dealing with the brace syntax
        const regex = new RegExp(`\\{\\{${token}\\}\\}`, 'g');
        result = result.replace(regex, `{{${token}:${name}}}`);
    }
    return result;
};

/**
 * Strip token mappings from a template string.
 *
 * Transforms `{{token:name}}` back into `{{token}}`.
 * Also transforms `{{:name}}` patterns (capture-only) into `{{}}` (which is invalid/empty).
 *
 * Useful for normalizing templates for storage or comparison.
 *
 * @param template - The template string to strip
 * @returns Template string with capture names removed
 *
 * @example
 * stripTokenMappings('{{raqms:num}} {{dash}}')
 * // → '{{raqms}} {{dash}}'
 */
export const stripTokenMappings = (template: string) => {
    // Match {{token:name}} and replace with {{token}}
    return template.replace(/\{\{([^:}]+):[^}]+\}\}/g, '{{$1}}');
};
