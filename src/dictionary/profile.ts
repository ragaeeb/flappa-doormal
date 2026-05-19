import type {
    ArabicDictionaryProfile,
    DictionaryBlocker,
    DictionaryFamily,
    DictionaryGate,
    DictionaryProfileValidationIssue,
    DictionaryZone,
    NormalizedArabicDictionaryProfile,
    NormalizedDictionaryBlocker,
    NormalizedDictionaryFamily,
    NormalizedDictionaryGate,
    NormalizedDictionaryZone,
} from '@/types/dictionary.js';
import { normalizeArabicForComparison } from '@/utils/textUtils.js';
import { normalizeStopLemmaWord } from './constants.js';

const normalizedProfileCache = new WeakMap<ArabicDictionaryProfile, NormalizedArabicDictionaryProfile>();
const PREVIOUS_WORD_SCOPES = ['samePage', 'pageStart', 'any'] as const;
const BLOCKER_PRECISIONS = ['high', 'aggressive'] as const;

const uniqueNormalizedSet = (values: string[], normalize: (value: string) => string): ReadonlySet<string> =>
    new Set(values.map(normalize).filter(Boolean));

const assertNever = (value: never): never => {
    throw new Error(`Unhandled dictionary profile variant: ${JSON.stringify(value)}`);
};

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
        default:
            return assertNever(family);
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
            return {
                ...blocker,
                normalizedWords: uniqueNormalizedSet(blocker.words, normalizeStopLemmaWord),
            };
        case 'previousWord':
            return {
                ...blocker,
                normalizedWords: uniqueNormalizedSet(blocker.words, normalizeArabicForComparison),
                scope: blocker.scope ?? 'samePage',
            };
        case 'previousChar':
            return {
                ...blocker,
                charSet: new Set(blocker.chars),
            };
        case 'intro':
            return blocker;
        case 'pageContinuation':
            return {
                ...blocker,
                authorityPrecision: blocker.authorityPrecision ?? 'high',
            };
        default:
            return assertNever(blocker);
    }
};

const normalizeGate = (gate: DictionaryGate): NormalizedDictionaryGate => {
    if (gate.use === 'headingToken') {
        return gate;
    }

    const trimmedMatch = gate.match.trim();
    return {
        ...gate,
        normalizedMatch: normalizeArabicForComparison(trimmedMatch),
        trimmedMatch,
    };
};

const normalizeZone = (zone: DictionaryZone): NormalizedDictionaryZone => ({
    blockers: (zone.blockers ?? []).map(normalizeBlocker),
    families: zone.families.map(normalizeFamily),
    name: zone.name,
    when: zone.when
        ? {
              activateAfter: zone.when.activateAfter?.map(normalizeGate),
              maxPageId: zone.when.maxPageId,
              minPageId: zone.when.minPageId,
          }
        : undefined,
});

const createIssue = (
    code: DictionaryProfileValidationIssue['code'],
    path: string,
    message: string,
    zoneName?: string,
): DictionaryProfileValidationIssue => ({
    code,
    message,
    path,
    ...(zoneName ? { zoneName } : {}),
});

const hasBlankString = (values: string[]) => values.length === 0 || values.some((value) => !value.trim());

const pushBlockerIssue = (
    issues: DictionaryProfileValidationIssue[],
    code: DictionaryProfileValidationIssue['code'],
    path: string,
    message: string,
    zoneName: string,
) => {
    issues.push(createIssue(code, path, message, zoneName));
};

const validateAuthorityPrecision = (
    issues: DictionaryProfileValidationIssue[],
    blockerPath: string,
    zoneName: string,
    code: 'invalid_authority_intro_precision' | 'invalid_continuation_precision',
    fieldName: 'precision' | 'authorityPrecision',
    value: string | undefined,
    blockerUse: 'authorityIntro' | 'pageContinuation',
) => {
    if (value === undefined || BLOCKER_PRECISIONS.includes(value as (typeof BLOCKER_PRECISIONS)[number])) {
        return;
    }

    pushBlockerIssue(
        issues,
        code,
        `${blockerPath}.${fieldName}`,
        `${blockerUse} blocker in zone "${zoneName}" must use ${fieldName} "high" or "aggressive"`,
        zoneName,
    );
};

const validatePreviousWordBlocker = (
    blocker: Extract<DictionaryBlocker, { use: 'previousWord' }>,
    blockerPath: string,
    zoneName: string,
    issues: DictionaryProfileValidationIssue[],
) => {
    if (hasBlankString(blocker.words)) {
        pushBlockerIssue(
            issues,
            'invalid_previous_words',
            `${blockerPath}.words`,
            `previousWord blocker in zone "${zoneName}" must include non-empty words`,
            zoneName,
        );
    }

    if (blocker.scope !== undefined && !PREVIOUS_WORD_SCOPES.includes(blocker.scope)) {
        pushBlockerIssue(
            issues,
            'invalid_previous_word_scope',
            `${blockerPath}.scope`,
            `previousWord blocker in zone "${zoneName}" must use scope "samePage", "pageStart", or "any"`,
            zoneName,
        );
    }
};

const validatePreviousCharBlocker = (
    blocker: Extract<DictionaryBlocker, { use: 'previousChar' }>,
    blockerPath: string,
    zoneName: string,
    issues: DictionaryProfileValidationIssue[],
) => {
    if (blocker.chars.length === 0 || blocker.chars.some((char) => !char)) {
        pushBlockerIssue(
            issues,
            'invalid_previous_chars',
            `${blockerPath}.chars`,
            `previousChar blocker in zone "${zoneName}" must include chars`,
            zoneName,
        );
    }
};

const validateStopLemmaBlocker = (
    blocker: Extract<DictionaryBlocker, { use: 'stopLemma' }>,
    blockerPath: string,
    zoneName: string,
    issues: DictionaryProfileValidationIssue[],
) => {
    if (hasBlankString(blocker.words)) {
        pushBlockerIssue(
            issues,
            'invalid_stop_words',
            `${blockerPath}.words`,
            `stopLemma blocker in zone "${zoneName}" must include non-empty words`,
            zoneName,
        );
    }
};

const validateGate = (
    gate: DictionaryGate,
    zone: DictionaryZone,
    gateIndex: number,
    seenActivateAfterKeys: Set<string>,
    issues: DictionaryProfileValidationIssue[],
) => {
    const gatePath = `zones[].when.activateAfter[${gateIndex}]`.replace('[]', `[${zone.name}]`);

    if (gate.use === 'headingText') {
        if (!gate.match.trim()) {
            issues.push(
                createIssue(
                    'invalid_gate_match',
                    `${gatePath}.match`,
                    `dictionary gate match must be non-empty`,
                    zone.name,
                ),
            );
        }
        if (gate.fuzzy !== undefined && typeof gate.fuzzy !== 'boolean') {
            issues.push(
                createIssue(
                    'invalid_gate_fuzzy',
                    `${gatePath}.fuzzy`,
                    `dictionary gate fuzzy must be a boolean when provided`,
                    zone.name,
                ),
            );
        }
    }

    const dedupeKey = `${gate.use}:${JSON.stringify(gate)}`;
    if (seenActivateAfterKeys.has(dedupeKey)) {
        issues.push(
            createIssue(
                'duplicate_activate_after_gate',
                gatePath,
                `dictionary zone "${zone.name}" has duplicate activateAfter gates`,
                zone.name,
            ),
        );
    }
    seenActivateAfterKeys.add(dedupeKey);
};

const validateFamily = (
    family: DictionaryFamily,
    zone: DictionaryZone,
    familyIndex: number,
    issues: DictionaryProfileValidationIssue[],
) => {
    const familyPath = `zones[].families[${familyIndex}]`.replace('[]', `[${zone.name}]`);

    switch (family.use) {
        case 'heading':
            if (family.classes.length === 0) {
                issues.push(
                    createIssue(
                        'empty_heading_classes',
                        `${familyPath}.classes`,
                        `dictionary heading family in zone "${zone.name}" must include at least one class`,
                        zone.name,
                    ),
                );
            }
            if (family.emit === 'chapter' && !family.classes.includes('chapter')) {
                issues.push(
                    createIssue(
                        'inert_heading_family',
                        familyPath,
                        `dictionary heading family in zone "${zone.name}" emits "chapter" but never matches chapter headings`,
                        zone.name,
                    ),
                );
            }
            if (family.emit === 'marker' && !family.classes.includes('marker')) {
                issues.push(
                    createIssue(
                        'inert_heading_family',
                        familyPath,
                        `dictionary heading family in zone "${zone.name}" emits "marker" but never matches marker headings`,
                        zone.name,
                    ),
                );
            }
            if (family.emit === 'entry' && !family.classes.includes('entry')) {
                issues.push(
                    createIssue(
                        'inert_heading_family',
                        familyPath,
                        `dictionary heading family in zone "${zone.name}" emits "entry" but never matches entry headings`,
                        zone.name,
                    ),
                );
            }
            break;
        case 'lineEntry':
            break;
        case 'inlineSubentry':
            if (family.prefixes?.some((prefix) => !prefix.trim())) {
                issues.push(
                    createIssue(
                        'empty_inline_prefixes',
                        `${familyPath}.prefixes`,
                        `inlineSubentry prefixes must be non-empty strings`,
                        zone.name,
                    ),
                );
            }
            break;
        case 'codeLine':
            break;
        case 'pairedForms':
            break;
        default:
            assertNever(family);
    }
};

const validateBlocker = (
    blocker: DictionaryBlocker,
    zone: DictionaryZone,
    blockerIndex: number,
    issues: DictionaryProfileValidationIssue[],
) => {
    const blockerPath = `zones[].blockers[${blockerIndex}]`.replace('[]', `[${zone.name}]`);
    switch (blocker.use) {
        case 'authorityIntro':
            validateAuthorityPrecision(
                issues,
                blockerPath,
                zone.name,
                'invalid_authority_intro_precision',
                'precision',
                blocker.precision,
                'authorityIntro',
            );
            break;
        case 'stopLemma':
            validateStopLemmaBlocker(blocker, blockerPath, zone.name, issues);
            break;
        case 'previousWord':
            validatePreviousWordBlocker(blocker, blockerPath, zone.name, issues);
            break;
        case 'previousChar':
            validatePreviousCharBlocker(blocker, blockerPath, zone.name, issues);
            break;
        case 'intro':
            break;
        case 'pageContinuation':
            validateAuthorityPrecision(
                issues,
                blockerPath,
                zone.name,
                'invalid_continuation_precision',
                'authorityPrecision',
                blocker.authorityPrecision,
                'pageContinuation',
            );
            break;
        default:
            assertNever(blocker);
    }
};

export class DictionaryProfileValidationError extends Error {
    readonly issues: DictionaryProfileValidationIssue[];

    constructor(issues: DictionaryProfileValidationIssue[]) {
        super(
            issues.length === 1
                ? issues[0]!.message
                : `Dictionary profile validation failed with ${issues.length} issues`,
        );
        this.name = 'DictionaryProfileValidationError';
        this.issues = issues;
    }
}

const validateZone = (
    zone: DictionaryZone,
    zoneIndex: number,
    seenZoneNames: Set<string>,
    issues: DictionaryProfileValidationIssue[],
) => {
    const zonePath = `zones[${zoneIndex}]`;
    const trimmedName = zone.name.trim();

    if (!trimmedName) {
        issues.push(createIssue('empty_zone_name', `${zonePath}.name`, `dictionary zone name must be non-empty`));
    } else if (seenZoneNames.has(trimmedName)) {
        issues.push(
            createIssue(
                'duplicate_zone_name',
                `${zonePath}.name`,
                `dictionary zone names must be unique; duplicated "${trimmedName}"`,
                trimmedName,
            ),
        );
    } else {
        seenZoneNames.add(trimmedName);
    }

    if (zone.families.length === 0) {
        issues.push(
            createIssue(
                'empty_zone_families',
                `${zonePath}.families`,
                `dictionary zone "${zone.name}" must declare at least one family`,
                zone.name,
            ),
        );
    }

    if (
        zone.when?.minPageId !== undefined &&
        zone.when?.maxPageId !== undefined &&
        zone.when.minPageId > zone.when.maxPageId
    ) {
        issues.push(
            createIssue(
                'invalid_zone_page_range',
                `${zonePath}.when`,
                `dictionary zone "${zone.name}" has minPageId greater than maxPageId`,
                zone.name,
            ),
        );
    }

    const seenActivateAfterKeys = new Set<string>();
    for (let gateIndex = 0; gateIndex < (zone.when?.activateAfter?.length ?? 0); gateIndex++) {
        validateGate(zone.when!.activateAfter![gateIndex]!, zone, gateIndex, seenActivateAfterKeys, issues);
    }

    for (let familyIndex = 0; familyIndex < zone.families.length; familyIndex++) {
        validateFamily(zone.families[familyIndex]!, zone, familyIndex, issues);
    }

    for (let blockerIndex = 0; blockerIndex < (zone.blockers?.length ?? 0); blockerIndex++) {
        validateBlocker(zone.blockers![blockerIndex]!, zone, blockerIndex, issues);
    }
};

/**
 * Validates a dictionary profile without normalizing it.
 */
export const validateDictionaryProfile = (profile: ArabicDictionaryProfile): DictionaryProfileValidationIssue[] => {
    const issues: DictionaryProfileValidationIssue[] = [];

    if (profile.version !== 2) {
        issues.push(
            createIssue('invalid_version', 'version', `dictionary profile version must be 2, got ${profile.version}`),
        );
    }

    if (profile.zones.length === 0) {
        issues.push(createIssue('missing_zones', 'zones', `dictionary profile must contain at least one zone`));
        return issues;
    }

    const seenZoneNames = new Set<string>();
    for (let zoneIndex = 0; zoneIndex < profile.zones.length; zoneIndex++) {
        validateZone(profile.zones[zoneIndex]!, zoneIndex, seenZoneNames, issues);
    }

    return issues;
};

/**
 * Normalizes and validates a dictionary profile before runtime matching.
 */
export const normalizeDictionaryProfile = (profile: ArabicDictionaryProfile): NormalizedArabicDictionaryProfile => {
    const cached = normalizedProfileCache.get(profile);
    if (cached) {
        return cached;
    }

    const issues = validateDictionaryProfile(profile);
    if (issues.length > 0) {
        throw new DictionaryProfileValidationError(issues);
    }

    const normalized: NormalizedArabicDictionaryProfile = {
        version: 2,
        zones: profile.zones.map(normalizeZone),
    };
    normalizedProfileCache.set(profile, normalized);
    return normalized;
};
