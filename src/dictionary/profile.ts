import type {
    ArabicDictionaryProfile,
    DictionaryBlocker,
    DictionaryFamily,
    DictionaryZone,
    NormalizedArabicDictionaryProfile,
    NormalizedDictionaryBlocker,
    NormalizedDictionaryFamily,
    NormalizedDictionaryZone,
} from '@/types/dictionary.js';
import { normalizeArabicForComparison } from '@/utils/textUtils.js';

const normalizeStopLemmaWord = (word: string) =>
    normalizeArabicForComparison(word)
        .replace(/^[\s:؛،,.!?؟()[\]{}«»"'“”‘’]+/gu, '')
        .replace(/[\s:؛،,.!?؟()[\]{}«»"'“”‘’]+$/gu, '')
        .trim();

const normalizeFamily = (family: DictionaryFamily): NormalizedDictionaryFamily => {
    switch (family.use) {
        case 'heading':
            return {
                ...family,
                allowNextLineColon: family.allowNextLineColon ?? false,
                allowSingleLetter: family.allowSingleLetter ?? false,
            };
        case 'lineEntry':
            return {
                ...family,
                allowMultiWord: family.allowMultiWord ?? false,
                allowWhitespaceBeforeColon: family.allowWhitespaceBeforeColon ?? false,
                wrappers: family.wrappers ?? 'none',
            };
        case 'inlineSubentry':
            return {
                ...family,
                prefixes: family.prefixes ?? ['و'],
                stripPrefixesFromLemma: family.stripPrefixesFromLemma ?? true,
            };
        case 'codeLine':
            return {
                ...family,
                wrappers: family.wrappers ?? 'either',
            };
        case 'pairedForms':
            return {
                ...family,
                requireStatusTail: family.requireStatusTail ?? false,
                separator: family.separator ?? 'comma',
            };
    }
};

const normalizeBlocker = (blocker: DictionaryBlocker): NormalizedDictionaryBlocker => {
    switch (blocker.use) {
        case 'authorityIntro':
            return {
                ...blocker,
                precision: blocker.precision ?? 'high',
            };
        case 'stopLemma':
        case 'previousWord':
            return {
                ...blocker,
                normalizedWords: [
                    ...new Set(
                        blocker.words
                            .map((word) =>
                                blocker.use === 'stopLemma'
                                    ? normalizeStopLemmaWord(word)
                                    : normalizeArabicForComparison(word),
                            )
                            .filter(Boolean),
                    ),
                ],
            };
        case 'previousChar':
            return {
                ...blocker,
                charSet: new Set(blocker.chars),
            };
        default:
            return blocker;
    }
};

const normalizeZone = (zone: DictionaryZone): NormalizedDictionaryZone => ({
    blockers: (zone.blockers ?? []).map(normalizeBlocker),
    families: zone.families.map(normalizeFamily),
    name: zone.name,
    when: zone.when
        ? {
              activateAfter: zone.when.activateAfter,
              maxPageId: zone.when.maxPageId,
              minPageId: zone.when.minPageId,
          }
        : undefined,
});

const assertValidVersion = (profile: ArabicDictionaryProfile): void => {
    if (profile.version !== 2) {
        throw new Error(`dictionary profile version must be 2, got ${profile.version}`);
    }
};

const assertValidZone = (zone: DictionaryZone): void => {
    if (!zone.name.trim()) {
        throw new Error(`dictionary zone name must be non-empty`);
    }

    if (zone.families.length === 0) {
        throw new Error(`dictionary zone "${zone.name}" must declare at least one family`);
    }

    if (
        zone.when?.minPageId !== undefined &&
        zone.when?.maxPageId !== undefined &&
        zone.when.minPageId > zone.when.maxPageId
    ) {
        throw new Error(`dictionary zone "${zone.name}" has minPageId greater than maxPageId`);
    }

    for (const blocker of zone.blockers ?? []) {
        if (blocker.use === 'stopLemma' || blocker.use === 'previousWord') {
            if (blocker.words.length === 0) {
                throw new Error(`dictionary blocker "${blocker.use}" in zone "${zone.name}" must include words`);
            }
        }
        if (blocker.use === 'previousChar' && blocker.chars.length === 0) {
            throw new Error(`dictionary blocker "previousChar" in zone "${zone.name}" must include chars`);
        }
    }
};

const assertUniqueZoneNames = (zones: DictionaryZone[]): void => {
    const seen = new Set<string>();
    for (const zone of zones) {
        if (seen.has(zone.name)) {
            throw new Error(`dictionary zone names must be unique; duplicated "${zone.name}"`);
        }
        seen.add(zone.name);
    }
};

/**
 * Normalizes and validates a dictionary profile before runtime matching.
 */
export const normalizeDictionaryProfile = (profile: ArabicDictionaryProfile): NormalizedArabicDictionaryProfile => {
    assertValidVersion(profile);

    if (profile.zones.length === 0) {
        throw new Error(`dictionary profile must contain at least one zone`);
    }

    assertUniqueZoneNames(profile.zones);
    for (const zone of profile.zones) {
        assertValidZone(zone);
    }

    return {
        version: 2,
        zones: profile.zones.map(normalizeZone),
    };
};
