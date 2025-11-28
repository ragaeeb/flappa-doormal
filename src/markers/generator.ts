/**
 * Main entry point for marker regex generation
 * Delegates to type-specific generators
 */

import type { MarkerConfig } from '../types.js';
import { DEFAULT_NUMBERING, DEFAULT_SEPARATOR } from './defaults.js';
import {
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
} from './type-generators.js';

/**
 * Normalized marker config with all defaults applied
 * This ensures generators always receive complete configurations
 */
type NormalizedMarkerConfig = Required<Pick<MarkerConfig, 'numbering' | 'separator'>> & MarkerConfig;

/**
 * Generates a regex pattern from a marker configuration.
 * Always returns a regex with three named capture groups:
 * - full: Complete match including marker
 * - marker: Just the marker part (for metadata/indexing)
 * - content: Clean content without marker (for LLM processing)
 * 
 * This function applies all default values before delegating to type-specific generators.
 * 
 * @param config - Marker configuration
 * @returns Regular expression with named groups
 * 
 * @example
 * const regex = generateRegexFromMarker({ type: 'numbered' });
 * const match = regex.exec('٥ - نص');
 * match.groups.full    // "٥ - نص"
 * match.groups.marker  // "٥ -"
 * match.groups.content // "نص"
 */
export function generateRegexFromMarker(config: MarkerConfig): RegExp {
    // Apply all defaults in one place - single source of truth
    const normalized: NormalizedMarkerConfig = {
        numbering: config.numbering ?? DEFAULT_NUMBERING,
        separator: config.separator ?? DEFAULT_SEPARATOR,
        ...config,
    };

    // Delegate to type-specific generators
    // Generators now receive normalized config with all defaults applied
    switch (normalized.type) {
        case 'pattern':
            return generatePatternRegex(normalized);
        case 'bab':
            return generateBabRegex();
        case 'hadith-chain':
            return generateHadithChainRegex(normalized);
        case 'basmala':
            return generateBasmalaRegex();
        case 'phrase':
            return generatePhraseRegex(normalized);
        case 'square-bracket':
            return generateSquareBracketRegex();
        case 'num-letter':
            return generateNumLetterRegex(normalized);
        case 'num-paren':
            return generateNumParenRegex(normalized);
        case 'num-slash':
            return generateNumSlashRegex(normalized);
        case 'numbered':
            return generateNumberedRegex(normalized);
        case 'bullet':
            return generateBulletRegex();
        case 'heading':
            return generateHeadingRegex();
        default: {
            // TypeScript exhaustiveness check
            const _exhaustive: never = normalized.type;
            throw new Error(`Unknown marker type: ${_exhaustive}`);
        }
    }
}
