import type { TokenMap } from './tokens.js';
import { TOKENS } from './tokens.js';

/**
 * Result of template validation
 */
export interface ValidationResult {
    valid: boolean;
    errors?: string[];
}

/**
 * Options for template expansion
 */
export interface ExpandOptions {
    /** Custom token map to use instead of default TOKENS */
    tokens?: TokenMap;
}

/**
 * Expands a template string into a regex pattern using named capture groups.
 * Always creates three groups: full (entire match), marker (just the marker), content (clean text).
 * 
 * The content group uses [\s\S]*? (non-greedy) to match across newlines but stop at next marker.
 * 
 * @param template - Template string with {token} placeholders
 * @param options - Optional configuration
 * @returns Regex pattern string with named groups
 * 
 * @example
 * expandTemplate('{num} {dash}')
 * // Returns: ^(?<full>(?<marker>[\\u0660-\\u0669]+\\s?[-–—ـ])(?<content>[\\s\\S]*?))
 */
export function expandTemplate(template: string, options?: ExpandOptions): string {
    const tokenMap = options?.tokens || TOKENS;

    // Replace {token} placeholders with actual patterns
    let expandedMarker = template;
    for (const [token, pattern] of Object.entries(tokenMap)) {
        const placeholder = `{${token}}`;
        expandedMarker = expandedMarker.replaceAll(placeholder, pattern);
    }

    // Always create three named groups:
    // - full: complete match (for segmentation)
    // - marker: just the marker part (for metadata/indexing)
    // - content: clean content (for LLM processing) - uses [\s\S]* to match newlines
    // Note: greedy * is correct here - ilmtest-cli must split content by marker positions
    return String.raw`^(?<full>(?<marker>${expandedMarker})(?<content>[\s\S]*))`;
}

/**
 * Create a custom token map by extending the base tokens.
 * 
 * @param customTokens - Custom token definitions
 * @returns Combined token map
 * 
 * @example
 * const myTokens = createTokenMap({
 *   verse: '\\[[\\u0660-\\u0669]+\\]',
 *   tafsir: 'تفسير'
 * });
 */
export function createTokenMap(customTokens: Record<string, string>): TokenMap {
    return { ...TOKENS, ...customTokens };
}

/**
 * Validates a template string.
 * 
 * @param template - Template to validate
 * @param tokens - Token map to validate against
 * @returns Validation result with errors if invalid
 * 
 * @example
 * validateTemplate('{num} {dash}')
 * // Returns: { valid: true }
 * 
 * validateTemplate('{invalid}')
 * // Returns: { valid: false, errors: ['Unknown token: {invalid}'] }
 */
export function validateTemplate(template: string, tokens: TokenMap = TOKENS): ValidationResult {
    const tokenMatches = template.match(/\{(\w+)\}/g) || [];
    const tokenNames = tokenMatches.map(t => t.slice(1, -1));
    const unknownTokens = tokenNames.filter(name => !tokens[name]);

    if (unknownTokens.length > 0) {
        return {
            valid: false,
            errors: [
                `Unknown tokens: ${unknownTokens.map(t => `{${t}}`).join(', ')}`,
                `Available tokens: ${Object.keys(tokens).map(t => `{${t}}`).join(', ')}`
            ]
        };
    }

    return { valid: true };
}
