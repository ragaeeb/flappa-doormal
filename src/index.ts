/**
 * flappa-doormal - Arabic text marker pattern library
 *
 * A TypeScript library for generating regex patterns from declarative marker configurations.
 * Designed for Arabic text segmentation with support for template-based patterns.
 */

// Centralized defaults - single source of truth
export {
    DEFAULT_NUMBERING,
    DEFAULT_SEPARATOR,
    DEFAULT_SEPARATOR_PATTERN,
    NUMBERING_PATTERNS,
    SEPARATOR_PATTERNS,
} from './markers/defaults.js';

export { generateRegexFromMarker } from './markers/generator.js';
export { DEFAULT_BASMALA_PATTERNS, DEFAULT_HADITH_PHRASES } from './markers/presets.js';
export { createTokenMap, expandTemplate, validateTemplate } from './markers/template-parser.js';
export { TOKENS } from './markers/tokens.js';

export {
    generateBabRegex,
    generateBasmalaRegex,
    generateBulletRegex,
    generateHadithChainRegex,
    generateHeadingRegex,
    generateNumberedRegex,
    generateNumLetterRegex,
    generateNumParenRegex,
    generateNumSlashRegex,
    generatePatternRegex,
    generatePhraseRegex,
    generateSquareBracketRegex,
} from './markers/type-generators.js';

export type {
    MarkerConfig,
    MarkerType,
    NumberingStyle,
    SeparatorStyle,
} from './types.js';
