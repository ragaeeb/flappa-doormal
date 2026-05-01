/**
 * Dictionary v2 profile types for Shamela-style Arabic dictionary segmentation.
 */

export type DictionaryHeadingClass = 'chapter' | 'entry' | 'marker' | 'cluster';
export type DictionaryHeadingScanClass = DictionaryHeadingClass | 'noise';

export type DictionarySegmentKind = 'chapter' | 'entry' | 'marker';
export type DictionarySegmentMeta = {
    kind: DictionarySegmentKind;
    lemma?: string;
};
/** Family key used by diagnostics and authoring tools. */
export type DictionaryFamilyUse = DictionaryFamily['use'];
/** Rejection reason emitted by dictionary-profile diagnostics. */
export type DictionaryDiagnosticReason =
    | 'qualifierTail'
    | 'structuralLeak'
    | 'intro'
    | 'authorityIntro'
    | 'stopLemma'
    | 'previousWord'
    | 'previousChar'
    | 'pageContinuation';

export type DictionaryGate =
    | { use: 'headingText'; match: string; fuzzy?: boolean }
    | { use: 'headingToken'; token: 'bab' | 'fasl' | 'kitab' };

export type DictionaryProfileValidationIssueCode =
    | 'invalid_version'
    | 'missing_zones'
    | 'duplicate_zone_name'
    | 'empty_zone_name'
    | 'empty_zone_families'
    | 'invalid_zone_page_range'
    | 'empty_heading_classes'
    | 'inert_heading_family'
    | 'empty_inline_prefixes'
    | 'invalid_gate_match'
    | 'invalid_gate_fuzzy'
    | 'duplicate_activate_after_gate'
    | 'invalid_stop_words'
    | 'invalid_previous_words'
    | 'invalid_previous_chars';

export type DictionaryProfileValidationIssue = {
    code: DictionaryProfileValidationIssueCode;
    message: string;
    path: string;
    zoneName?: string;
};

export type HeadingFamily = {
    use: 'heading';
    classes: DictionaryHeadingClass[];
    emit: DictionarySegmentKind;
    allowNextLineColon?: boolean;
    allowSingleLetter?: boolean;
};

export type LineEntryFamily = {
    use: 'lineEntry';
    wrappers?: 'none' | 'parentheses' | 'brackets' | 'curly' | 'any';
    allowWhitespaceBeforeColon?: boolean;
    allowMultiWord?: boolean;
    emit: 'entry';
};

export type InlineSubentryFamily = {
    use: 'inlineSubentry';
    prefixes?: string[];
    stripPrefixesFromLemma?: boolean;
    emit: 'entry';
};

export type CodeLineFamily = {
    use: 'codeLine';
    wrappers?: 'none' | 'paired' | 'mismatched' | 'either';
    emit: 'marker';
};

export type PairedFormsFamily = {
    use: 'pairedForms';
    separator?: 'comma' | 'space';
    emit: 'marker' | 'entry';
    requireStatusTail?: boolean;
};

export type DictionaryFamily =
    | HeadingFamily
    | LineEntryFamily
    | InlineSubentryFamily
    | CodeLineFamily
    | PairedFormsFamily;

export type PageContinuationBlocker = {
    use: 'pageContinuation';
    appliesTo?: DictionaryFamily['use'][];
};

export type IntroBlocker = {
    use: 'intro';
    appliesTo?: DictionaryFamily['use'][];
};

export type AuthorityIntroBlocker = {
    use: 'authorityIntro';
    appliesTo?: DictionaryFamily['use'][];
    precision?: 'high' | 'aggressive';
};

export type StopLemmaBlocker = {
    use: 'stopLemma';
    appliesTo?: DictionaryFamily['use'][];
    words: string[];
};

export type PreviousWordBlocker = {
    use: 'previousWord';
    appliesTo?: DictionaryFamily['use'][];
    words: string[];
};

export type PreviousCharBlocker = {
    use: 'previousChar';
    appliesTo?: DictionaryFamily['use'][];
    chars: string[];
};

export type DictionaryBlocker =
    | PageContinuationBlocker
    | IntroBlocker
    | AuthorityIntroBlocker
    | StopLemmaBlocker
    | PreviousWordBlocker
    | PreviousCharBlocker;

export type DictionaryZone = {
    name: string;
    when?: {
        minPageId?: number;
        maxPageId?: number;
        activateAfter?: DictionaryGate[];
    };
    families: DictionaryFamily[];
    blockers?: DictionaryBlocker[];
};

export type ArabicDictionaryProfile = {
    version: 2;
    zones: DictionaryZone[];
};

/** Sampled accepted or rejected candidate from dictionary-profile diagnostics. */
export type DictionaryDiagnosticSample = {
    accepted: boolean;
    absoluteIndex: number;
    family: DictionaryFamilyUse;
    kind: DictionarySegmentKind;
    lemma?: string;
    line: number;
    pageId: number;
    reason?: DictionaryDiagnosticReason;
    text: string;
    zone: string;
};

/** Options for dictionary-profile diagnostics collection. */
export type DictionaryProfileDiagnosticsOptions = {
    sampleLimit?: number;
};

/** Aggregate diagnostics for tuning a dictionary profile. */
export type DictionaryProfileDiagnostics = {
    acceptedCount: number;
    acceptedKinds: Record<DictionarySegmentKind, number>;
    blockerHits: Record<DictionaryDiagnosticReason, number>;
    familyCounts: Record<DictionaryFamilyUse, { accepted: number; rejected: number }>;
    pageCount: number;
    rejectedCount: number;
    rejectedLemmas: Array<{ count: number; lemma: string }>;
    samples: DictionaryDiagnosticSample[];
    zoneCounts: Record<string, { accepted: number; rejected: number }>;
};

export interface NormalizedHeadingFamily extends HeadingFamily {
    allowNextLineColon: boolean;
    allowSingleLetter: boolean;
}

export interface NormalizedLineEntryFamily extends LineEntryFamily {
    allowMultiWord: boolean;
    allowWhitespaceBeforeColon: boolean;
    wrappers: NonNullable<LineEntryFamily['wrappers']>;
}

export interface NormalizedInlineSubentryFamily extends InlineSubentryFamily {
    prefixes: string[];
    stripPrefixesFromLemma: boolean;
}

export interface NormalizedCodeLineFamily extends CodeLineFamily {
    wrappers: NonNullable<CodeLineFamily['wrappers']>;
}

export interface NormalizedPairedFormsFamily extends PairedFormsFamily {
    requireStatusTail: boolean;
    separator: NonNullable<PairedFormsFamily['separator']>;
}

export type NormalizedDictionaryFamily =
    | NormalizedHeadingFamily
    | NormalizedLineEntryFamily
    | NormalizedInlineSubentryFamily
    | NormalizedCodeLineFamily
    | NormalizedPairedFormsFamily;

export interface NormalizedAuthorityIntroBlocker extends AuthorityIntroBlocker {
    precision: 'high' | 'aggressive';
}

export interface NormalizedStopLemmaBlocker extends StopLemmaBlocker {
    normalizedWords: ReadonlySet<string>;
}

export interface NormalizedPreviousWordBlocker extends PreviousWordBlocker {
    normalizedWords: ReadonlySet<string>;
}

export interface NormalizedPreviousCharBlocker extends PreviousCharBlocker {
    charSet: ReadonlySet<string>;
}

export type NormalizedDictionaryBlocker =
    | PageContinuationBlocker
    | IntroBlocker
    | NormalizedAuthorityIntroBlocker
    | NormalizedStopLemmaBlocker
    | NormalizedPreviousWordBlocker
    | NormalizedPreviousCharBlocker;

export type NormalizedDictionaryZone = {
    name: string;
    when?: {
        activateAfter?: DictionaryGate[];
        maxPageId?: number;
        minPageId?: number;
    };
    blockers: NormalizedDictionaryBlocker[];
    families: NormalizedDictionaryFamily[];
};

export type NormalizedArabicDictionaryProfile = {
    version: 2;
    zones: NormalizedDictionaryZone[];
};
