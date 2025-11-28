import { makeDiacriticInsensitive } from 'bitaboom';
import type { MarkerConfig } from '@/types.js';
import { NUMBERING_PATTERNS, SEPARATOR_PATTERNS } from './defaults.js';
import { DEFAULT_BASMALA_PATTERNS, DEFAULT_HADITH_PHRASES } from './presets.js';
import { createTokenMap, expandTemplate } from './template-parser.js';
import { TOKENS } from './tokens.js';

/**
 * Generates a regular expression for pattern-type markers.
 *
 * Supports two modes:
 * 1. Template-based: Uses the `template` field with token expansion
 * 2. Pattern-based: Uses the raw `pattern` field as-is
 *
 * @param config - Marker configuration with either `template` or `pattern` field
 * @returns A compiled RegExp object for matching the pattern
 * @throws {Error} When neither `template` nor `pattern` is provided
 *
 * @example
 * // Using template
 * const regex = generatePatternRegex({ type: 'pattern', template: '{num} {dash}' });
 *
 * @example
 * // Using raw pattern
 * const regex = generatePatternRegex({ type: 'pattern', pattern: '^\\d+' });
 *
 * @example
 * // Using custom tokens
 * const regex = generatePatternRegex({
 *   type: 'pattern',
 *   template: '{verse}',
 *   tokens: { verse: '\\[[0-9]+\\]' }
 * });
 */
export function generatePatternRegex(config: MarkerConfig): RegExp {
    if (config.template) {
        const tokenMap = config.tokens ? createTokenMap(config.tokens) : TOKENS;
        const pattern = expandTemplate(config.template, {
            tokens: tokenMap,
        });
        return new RegExp(pattern, 'u');
    }

    if (!config.pattern) {
        throw new Error('pattern marker must provide either a template or pattern');
    }
    return new RegExp(config.pattern, 'u');
}

/**
 * Generates a regular expression for 'bab' (chapter) markers.
 *
 * Matches Arabic chapter markers like باب, بَابُ, بَابٌ with optional diacritics.
 * The pattern is diacritic-insensitive using bitaboom's makeDiacriticInsensitive.
 *
 * @returns A compiled RegExp with named groups: `full`, `marker`, `content`
 *
 * @example
 * const regex = generateBabRegex();
 * const match = regex.exec('باب الصلاة');
 * // match.groups.marker -> 'باب'
 * // match.groups.content -> ' الصلاة'
 */
export function generateBabRegex(): RegExp {
    const babPattern = makeDiacriticInsensitive('باب');
    const pattern = String.raw`^(?<full>(?<marker>${babPattern}[ًٌٍَُ]?)(?<content>[\s\S]*))`;
    return new RegExp(pattern, 'u');
}

/**
 * Generates a regular expression for hadith chain (isnad) markers.
 *
 * Matches common hadith narrator phrases like حَدَّثَنَا, أَخْبَرَنَا, etc.
 * Uses default phrases from presets or custom phrases from config.
 * All phrases are made diacritic-insensitive.
 *
 * @param config - Marker configuration with optional `phrases` array
 * @returns A compiled RegExp with named groups: `full`, `marker`, `content`
 *
 * @example
 * // Using default phrases
 * const regex = generateHadithChainRegex({ type: 'hadith-chain' });
 * const match = regex.exec('حَدَّثَنَا أبو بكر');
 *
 * @example
 * // Using custom phrases
 * const regex = generateHadithChainRegex({
 *   type: 'hadith-chain',
 *   phrases: ['قَالَ', 'رَوَى']
 * });
 */
export function generateHadithChainRegex(config: MarkerConfig): RegExp {
    const phrases = config.phrases || DEFAULT_HADITH_PHRASES;
    const phrasesPattern = phrases.map((p) => makeDiacriticInsensitive(p)).join('|');
    const pattern = String.raw`^(?<full>(?<marker>${phrasesPattern})(?<content>[\s\S]*))`;
    return new RegExp(pattern, 'u');
}

/**
 * Generates a regular expression for basmala markers.
 *
 * Matches various forms of بِسْمِ اللَّهِ (In the name of Allah):
 * - بسم الله (without diacritics)
 * - بِسْمِ اللَّهِ (with diacritics)
 * - Special patterns like [بسم, [تم
 *
 * @returns A compiled RegExp with named groups: `full`, `marker`, `content`
 *
 * @example
 * const regex = generateBasmalaRegex();
 * const match = regex.exec('بسم الله الرحمن الرحيم');
 * // match.groups.marker -> 'بسم الله'
 */
export function generateBasmalaRegex(): RegExp {
    const patterns = DEFAULT_BASMALA_PATTERNS.map((p) => makeDiacriticInsensitive(p));
    const combinedPattern = patterns.join('|');
    const pattern = String.raw`^(?<full>(?<marker>${combinedPattern})(?<content>[\s\S]*))`;
    return new RegExp(pattern, 'u');
}

/**
 * Generates a regular expression for custom phrase markers.
 *
 * Similar to hadith-chain markers but requires explicit phrase list.
 * All phrases are made diacritic-insensitive.
 *
 * @param config - Marker configuration with required `phrases` array
 * @returns A compiled RegExp with named groups: `full`, `marker`, `content`
 * @throws {Error} When `phrases` is undefined or empty
 *
 * @example
 * const regex = generatePhraseRegex({
 *   type: 'phrase',
 *   phrases: ['فَائِدَةٌ', 'مَسْأَلَةٌ']
 * });
 */
export function generatePhraseRegex(config: MarkerConfig): RegExp {
    if (!config.phrases || config.phrases.length === 0) {
        throw new Error('phrase marker requires phrases array');
    }
    const phrasesPattern = config.phrases.map((p) => makeDiacriticInsensitive(p)).join('|');
    const pattern = String.raw`^(?<full>(?<marker>${phrasesPattern})(?<content>[\s\S]*))`;
    return new RegExp(pattern, 'u');
}

/**
 * Generates a regular expression for square bracket markers.
 *
 * Matches verse or hadith reference numbers in square brackets:
 * - [٦٥] - Simple bracket
 * - • [٦٥] - With bullet prefix
 * - ° [٦٥] - With degree prefix
 *
 * @returns A compiled RegExp with named groups: `full`, `marker`, `content`
 *
 * @example
 * const regex = generateSquareBracketRegex();
 * const match = regex.exec('[٦٥] نص الحديث');
 * // match.groups.content -> ' نص الحديث'
 */
export function generateSquareBracketRegex(): RegExp {
    const markerPattern = String.raw`[•°]?\s?\[[\u0660-\u0669]+\]\s?`;
    const pattern = String.raw`^(?<full>(?<marker>${markerPattern})(?<content>[\s\S]*))`;
    return new RegExp(pattern, 'u');
}

/**
 * Generates a regular expression for number-letter-separator markers.
 *
 * Matches patterns like:
 * - ٥ أ - (Arabic-Indic number, Arabic letter, dash)
 * - 5 ب. (Latin number, Arabic letter, dot)
 *
 * @param config - Configuration with required `numbering` and `separator` fields
 * @returns A compiled RegExp with named groups: `full`, `marker`, `content`
 *
 * @example
 * const regex = generateNumLetterRegex({
 *   numbering: 'arabic-indic',
 *   separator: 'dash'
 * });
 * const match = regex.exec('٥ أ - نص');
 */
export function generateNumLetterRegex(config: Pick<MarkerConfig, 'numbering' | 'separator'>): RegExp {
    const numPattern = NUMBERING_PATTERNS[config.numbering as keyof typeof NUMBERING_PATTERNS];
    const sepPattern = SEPARATOR_PATTERNS[config.separator as keyof typeof SEPARATOR_PATTERNS] ?? config.separator;
    const markerPattern = String.raw`${numPattern} [أ-ي]\s?${sepPattern}`;
    const pattern = String.raw`^(?<full>(?<marker>${markerPattern})(?<content>[\s\S]*))`;
    return new RegExp(pattern, 'u');
}

/**
 * Generates a regular expression for number-parenthetical-separator markers.
 *
 * Matches patterns like:
 * - ٥ (أ) - (number, parenthetical content, separator)
 * - 5 (٦) - (number with parenthetical number)
 *
 * @param config - Configuration with required `numbering` and `separator` fields
 * @returns A compiled RegExp with named groups: `full`, `marker`, `content`
 *
 * @example
 * const regex = generateNumParenRegex({
 *   numbering: 'arabic-indic',
 *   separator: 'dash'
 * });
 * const match = regex.exec('٥ (أ) - نص');
 */
export function generateNumParenRegex(config: Pick<MarkerConfig, 'numbering' | 'separator'>): RegExp {
    const numPattern = NUMBERING_PATTERNS[config.numbering as keyof typeof NUMBERING_PATTERNS];
    const sepPattern = SEPARATOR_PATTERNS[config.separator as keyof typeof SEPARATOR_PATTERNS] ?? config.separator;
    const markerPattern = String.raw`${numPattern}\s*\([\u0600-\u06FF\u0660-\u0669\s]+\)\s?${sepPattern}`;
    const pattern = String.raw`^(?<full>(?<marker>${markerPattern})(?<content>[\s\S]*))`;
    return new RegExp(pattern, 'u');
}

/**
 * Generates a regular expression for number-slash-number markers.
 *
 * Matches patterns like:
 * - ٥/٦ - (number slash number, separator)
 * - ٥ - (single number, separator)
 *
 * The second number after the slash is optional.
 *
 * @param config - Configuration with required `numbering` and `separator` fields
 * @returns A compiled RegExp with named groups: `full`, `marker`, `content`
 *
 * @example
 * const regex = generateNumSlashRegex({
 *   numbering: 'arabic-indic',
 *   separator: 'dash'
 * });
 * const match1 = regex.exec('٥/٦ - نص');
 * const match2 = regex.exec('٥ - نص'); // Also matches
 */
export function generateNumSlashRegex(config: Pick<MarkerConfig, 'numbering' | 'separator'>): RegExp {
    const numPattern = NUMBERING_PATTERNS[config.numbering as keyof typeof NUMBERING_PATTERNS];
    const sepPattern = SEPARATOR_PATTERNS[config.separator as keyof typeof SEPARATOR_PATTERNS] ?? config.separator;
    const markerPattern = String.raw`${numPattern}(?:\s?/\s?${numPattern})?\s?${sepPattern}`;
    const pattern = String.raw`^(?<full>(?<marker>${markerPattern})(?<content>[\s\S]*))`;
    return new RegExp(pattern, 'u');
}

/**
 * Generates a regular expression for numbered markers with optional format template.
 *
 * Supports two modes:
 * 1. Format template: Uses `format` field with token expansion (e.g., '{bullet}+ {num} {dash}')
 * 2. Default pattern: Uses `numbering` and `separator` to build standard numbered markers
 *
 * When using default pattern:
 * - Separator 'none' generates pattern without separator
 * - Custom separator strings are used as-is or looked up in SEPARATOR_PATTERNS
 *
 * @param config - Configuration with `numbering`, `separator`, and optional `format`/`tokens`
 * @returns A compiled RegExp with named groups: `full`, `marker`, `content`
 *
 * @example
 * // Using format template
 * const regex = generateNumberedRegex({
 *   numbering: 'arabic-indic',
 *   separator: 'dash',
 *   format: '{bullet}+ {num} {dash}'
 * });
 *
 * @example
 * // Using default pattern
 * const regex = generateNumberedRegex({
 *   numbering: 'arabic-indic',
 *   separator: 'dash'
 * });
 * const match = regex.exec('٥ - نص');
 *
 * @example
 * // With 'none' separator
 * const regex = generateNumberedRegex({
 *   numbering: 'latin',
 *   separator: 'none'
 * });
 * const match = regex.exec('5 text');
 */
export function generateNumberedRegex(
    config: Pick<MarkerConfig, 'numbering' | 'separator' | 'format' | 'tokens'>,
): RegExp {
    if (config.format) {
        const tokenMap = config.tokens ? createTokenMap(config.tokens) : TOKENS;
        const expandedPattern = expandTemplate(config.format, {
            tokens: tokenMap,
        });
        return new RegExp(expandedPattern, 'u');
    }

    const numPattern = NUMBERING_PATTERNS[config.numbering as keyof typeof NUMBERING_PATTERNS];
    const separator = config.separator;
    const sepPattern =
        separator !== 'none' ? (SEPARATOR_PATTERNS[separator as keyof typeof SEPARATOR_PATTERNS] ?? separator) : '';

    const markerPattern = sepPattern ? String.raw`${numPattern}\s?${sepPattern}` : numPattern;
    const pattern = String.raw`^(?<full>(?<marker>${markerPattern})(?<content>[\s\S]*))`;

    return new RegExp(pattern, 'u');
}

/**
 * Generates a regular expression for bullet-point markers.
 *
 * Matches common bullet characters:
 * - • (bullet)
 * - * (asterisk)
 * - ° (degree)
 * - - (dash)
 *
 * @returns A compiled RegExp with named groups: `full`, `marker`, `content`
 *
 * @example
 * const regex = generateBulletRegex();
 * const match = regex.exec('• نقطة');
 * // match.groups.content -> 'نقطة'
 */
export function generateBulletRegex(): RegExp {
    const pattern = '^(?<full>(?<marker>[•*°\\-]\\s?)(?<content>[\\s\\S]*))';
    return new RegExp(pattern, 'u');
}

/**
 * Generates a regular expression for Markdown-style heading markers.
 *
 * Matches heading levels using hash symbols:
 * - # Heading 1
 * - ## Heading 2
 * - ### Heading 3
 * - etc.
 *
 * @returns A compiled RegExp with named groups: `full`, `marker`, `content`
 *
 * @example
 * const regex = generateHeadingRegex();
 * const match = regex.exec('## عنوان فرعي');
 * // match.groups.marker -> '## '
 * // match.groups.content -> 'عنوان فرعي'
 */
export function generateHeadingRegex(): RegExp {
    const pattern = '^(?<full>(?<marker>#+\\s?)(?<content>[\\s\\S]*))';
    return new RegExp(pattern, 'u');
}
