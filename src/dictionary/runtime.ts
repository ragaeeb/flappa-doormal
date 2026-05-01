import type {
    ArabicDictionaryProfile,
    DictionaryDiagnosticReason,
    DictionaryGate,
    DictionaryHeadingClass,
    DictionaryProfileDiagnostics,
    DictionaryProfileDiagnosticsOptions,
    DictionarySegmentKind,
    NormalizedArabicDictionaryProfile,
    NormalizedDictionaryBlocker,
    NormalizedDictionaryFamily,
    NormalizedDictionaryZone,
} from '@/types/dictionary.js';
import type { Page } from '@/types/index.js';
import type { Logger } from '@/types/options.js';
import { ARABIC_WORD_WITH_OPTIONAL_MARKS_PATTERN, getTokenPattern } from '../segmentation/tokens.js';
import type { PageMap, SplitPoint } from '../types/segmenter.js';
import { normalizeArabicForComparison } from '../utils/textUtils.js';
import { classifyDictionaryHeading } from './heading-classifier.js';
import { normalizeDictionaryProfile } from './profile.js';

const INTRO_PHRASES = [
    'وقال',
    'قال',
    'وفي الحديث',
    'في الحديث',
    'وفي حديث',
    'في حديث',
    'وفي رواية',
    'في رواية',
    'وفي قراءة',
    'في قراءة',
    'وفي قول',
    'في قول',
    'وفي كلام',
    'في كلام',
    'ومنه قول',
    'ومنها قول',
    'وقرأ',
    'قرأ',
    'قراءة',
    'حديث',
    'ويقال',
    'وقيل',
    'قلت',
    'فقال',
    'قال الشاعر',
    'أنشد',
    'وأنشد',
];
const INTRO_TAIL_PHRASES = [
    'بفتح',
    'بالفتح',
    'بكسر',
    'بالكسر',
    'بضم',
    'بالضم',
    'بالتحريك',
    'حديث',
    'الحديث',
    'في التنزيل',
    'وفي التنزيل',
    'في التنزيل العزيز',
    'وفي التنزيل العزيز',
    'في مقتل',
    'وفي مقتل',
    'في المجاز',
    'وفي المجاز',
    'من المجاز',
    'ومن المجاز',
    'في رواية',
    'وفي رواية',
    'في قراءة',
    'وفي قراءة',
    'في قول',
    'وفي قول',
    'في كلام',
    'وفي كلام',
    'في صفة',
    'وفي صفة',
    'في خطبته',
    'وفي خطبته',
    'ومنه قول',
    'ومنها قول',
    'يقال لرقبة',
    'على جهتين',
    'قوله جل',
    'قوله جل وعز',
    'جل وعز',
    'ومنه حديث',
    'ومنه الحديث',
    'كرم الله',
    'صلى الله عليه',
    'رضي الله عنه',
    'رضي الله عنها',
    'رضي الله عنهما',
    'قال ابو',
    'وقال ابو',
    'عن ابي',
    'قال ابن',
    'وقال ابن',
    'عن ابن',
];
const INTRO_TAIL_PATTERNS = [
    /(?:^|\s)(?:في|وفي|ومنه|ومنها)\s+(?:حديث|الحديث|رواية|قراءة|قول|كلام|مقتل|صفة|خطبته)(?:\s+\S+){0,8}$/u,
    /(?:^|\s)(?:حديث|الحديث|رواية|قراءة|قول|كلام)(?:\s+\S+){1,8}$/u,
    /(?:^|\s)(?:قوله|قول(?:ه|هم)?|قال(?:\s+قائل)?|وقرأ|قرأ|قراءة)\s+(?:جل(?:\s+وعز)?|[^\s]+)$/u,
    /(?:^|\s)(?:ابو|ابي|ابا|ابن|بن|بنت)(?:\s+\S+){1,4}$/u,
    /(?:^|\s)(?:قال|وقال|انشد|وانشد|روي|وروي|اخبر|واخبر)(?:\s+\S+){0,4}$/u,
];
const QUALIFIER_TAIL_PREFIXES = [
    'أي',
    'قال',
    'تقول',
    'يقال',
    'يقول',
    'يريد',
    'يُريد',
    'ويقال',
    'ويقول',
    'وجمعه',
    'وجمعها',
    'والجميع',
    'والجمع',
];
const STRUCTURAL_LEMMA_PREFIXES = ['لجزء', 'جزء', 'ومما يستدرك عليه', 'آخر حرف', 'كتاب حرف'];
const STRUCTURAL_LINE_PATTERNS = [/^\d+\s*-\s*\(.+\)$/u, /^\(.+\)$/u, /^\(.+\)\s*##\s*/u];
const STRUCTURAL_LINE_KEYWORDS = ['باب', 'فصل', 'حرف', 'أبواب', 'كتاب', 'المعجمة', 'المهملة', 'المثناة'];
const CONTINUATION_PREV_WORDS = [
    'بفتح',
    'بالفتح',
    'بكسر',
    'بالكسر',
    'بضم',
    'بالضم',
    'بالتحريك',
    'قال',
    'وقال',
    'وقيل',
    'ويقال',
    'يقال',
    'قلت',
    'فقال',
    'قالوا',
    'من',
    'في',
    'على',
    'إذا',
    'نحو',
    'ثم',
    'وجل',
];
const AUTHORITY_RE =
    /^(?:(?:و)?قال\s+(?:أبو|ابن|ثعلب|الليث|الأزهري|الجوهري|الفراء)\b|(?:أبو|ابن|ثعلب|الليث|الأزهري|الجوهري|الفراء)\s+\S+)/u;
const AUTHORITY_HEAD_WORDS = [
    'الأزهري',
    'الأصمعي',
    'الأشجعي',
    'الأموي',
    'الأمويّ',
    'الجوهري',
    'الرياشي',
    'الزجاج',
    'الزجاجي',
    'الشيباني',
    'الفراء',
    'الكسائي',
    'اللحياني',
    'الليث',
    'المبرد',
    'المنذري',
    'ثعلب',
    'شمر',
];
const STRONG_SENTENCE_TERMINATORS = /[.!?؟؛۔…]$/u;
const TRAILING_PAGE_WRAP_NOISE = /[\s\u0660-\u0669\d«»"“”'‘’()[\]{}<>]+$/u;
const TRAILING_WORD_DELIMITERS = /[\s\u0660-\u0669\d«»"“”'‘’()[\]{}<>.,!?؟؛،:]+$/u;
const ARABIC_WORD_REGEX = new RegExp(ARABIC_WORD_WITH_OPTIONAL_MARKS_PATTERN, 'gu');
const HEADING_PREFIX = '## ';
const CODE_LINE_PATTERN = getTokenPattern('harfs').replaceAll('\\s+', '[ \\t]+');
const BARE_CODE_LEMMA_RE = new RegExp(`^(?:${CODE_LINE_PATTERN})$`, 'u');
const STATUS_TAIL_PATTERN = '(?:مستعمل|مستعملة|مستعملان|مهمل|مهملة)';
const GATE_TOKEN_MAP = {
    bab: 'باب',
    fasl: 'فصل',
    kitab: 'كتاب',
} as const;

type DictionaryFamilyUse = NormalizedDictionaryFamily['use'];

type HeadingFamily = Extract<NormalizedDictionaryFamily, { use: 'heading' }>;
type LineEntryFamily = Extract<NormalizedDictionaryFamily, { use: 'lineEntry' }>;
type InlineSubentryFamily = Extract<NormalizedDictionaryFamily, { use: 'inlineSubentry' }>;
type CodeLineFamily = Extract<NormalizedDictionaryFamily, { use: 'codeLine' }>;
type PairedFormsFamily = Extract<NormalizedDictionaryFamily, { use: 'pairedForms' }>;

const lineEntryRegexCache = new WeakMap<LineEntryFamily, RegExp>();
const inlineSubentryRegexCache = new WeakMap<InlineSubentryFamily, RegExp>();
const codeLineRegexCache = new WeakMap<CodeLineFamily, RegExp>();
const pairedFormsRegexCache = new WeakMap<PairedFormsFamily, RegExp>();

type DictionaryLine = {
    lineNumber: number;
    start: number;
    text: string;
};

type DictionaryCandidate = {
    absoluteIndex: number;
    contentStartOffset?: number;
    family: DictionaryFamilyUse;
    kind: DictionarySegmentKind;
    lemma?: string;
    localIndex: number;
    text: string;
};

type RejectionResult = {
    reason: DictionaryDiagnosticReason;
};

const trimTrailingPageWrapNoise = (text: string) => {
    let trimmed = text.trimEnd();
    while (trimmed !== trimmed.replace(TRAILING_PAGE_WRAP_NOISE, '')) {
        trimmed = trimmed.replace(TRAILING_PAGE_WRAP_NOISE, '');
    }
    return trimmed;
};

const endsWithStrongSentenceTerminator = (pageContent: string) => {
    return STRONG_SENTENCE_TERMINATORS.test(trimTrailingPageWrapNoise(pageContent));
};

const extractLastArabicWord = (text: string) => {
    const withoutTrailingDelimiters = trimTrailingPageWrapNoise(text).replace(TRAILING_WORD_DELIMITERS, '');
    const matches = [...withoutTrailingDelimiters.matchAll(ARABIC_WORD_REGEX)];
    return matches.at(-1)?.[0] ?? '';
};

const previousNonWhitespaceChar = (text: string): string => {
    for (let index = text.length - 1; index >= 0; index--) {
        const char = text[index];
        if (char && !/\s/u.test(char)) {
            return char;
        }
    }
    return '';
};

const normalizedEquals = (left: string, right: string): boolean =>
    normalizeArabicForComparison(left) === normalizeArabicForComparison(right);

const normalizedStartsWith = (text: string, prefix: string): boolean =>
    normalizeArabicForComparison(text).startsWith(normalizeArabicForComparison(prefix));

const normalizeStopLemma = (text: string): string =>
    normalizeArabicForComparison(text)
        .replace(/^[\s:؛،,.!?؟()[\]{}«»"'“”‘’]+/gu, '')
        .replace(/[\s:؛،,.!?؟()[\]{}«»"'“”‘’]+$/gu, '')
        .trim();

const normalizeIntroContextText = (text: string): string =>
    normalizeArabicForComparison(text)
        .replace(/[\\/]+/gu, ' ')
        .replace(/[«»"“”'‘’()[\]{}]+/gu, ' ')
        .replace(/\s+/gu, ' ')
        .trim();

const startsWithConfiguredWord = (words: string[], candidate: string): boolean =>
    words.some((word) => normalizedStartsWith(candidate, word));

const buildPageLines = (page: Page): DictionaryLine[] => {
    const parts = page.content.split('\n');
    const lines: DictionaryLine[] = [];
    let offset = 0;

    for (let index = 0; index < parts.length; index++) {
        const text = parts[index] ?? '';
        lines.push({ lineNumber: index + 1, start: offset, text });
        offset += text.length + 1;
    }

    return lines;
};

const headingMatchesGate = (headingText: string, gate: DictionaryGate): boolean => {
    if (gate.use === 'headingText') {
        const normalizedMatch = normalizeArabicForComparison(gate.match);
        const normalizedHeading = normalizeArabicForComparison(headingText);
        return (
            normalizedHeading === normalizedMatch ||
            normalizedHeading.startsWith(normalizedMatch) ||
            normalizedHeading.includes(normalizedMatch)
        );
    }

    return normalizedStartsWith(headingText, GATE_TOKEN_MAP[gate.token]);
};

const pageMatchesAnyGate = (page: Page, gates: DictionaryGate[]) => {
    const lines = page.content.split(/\n/u).map((line) => line.trim());

    return lines.some((line) => {
        if (!line.startsWith(HEADING_PREFIX)) {
            return false;
        }
        const headingText = line.slice(HEADING_PREFIX.length).trim();
        return gates.some((gate) => headingMatchesGate(headingText, gate));
    });
};

const createZoneActivationMap = (profile: NormalizedArabicDictionaryProfile, pages: Page[]) => {
    const activation = new Map<string, number | null>();

    for (const zone of profile.zones) {
        if (!zone.when?.activateAfter?.length) {
            activation.set(zone.name, null);
            continue;
        }

        let activatedAt: number | null = null;
        for (const page of pages) {
            if (pageMatchesAnyGate(page, zone.when.activateAfter)) {
                activatedAt = page.id;
                break;
            }
        }
        activation.set(zone.name, activatedAt);
    }

    return activation;
};

const pageMatchesZone = (
    zone: NormalizedDictionaryZone,
    activationMap: Map<string, number | null>,
    pageId: number,
): boolean => {
    if (zone.when?.minPageId !== undefined && pageId < zone.when.minPageId) {
        return false;
    }
    if (zone.when?.maxPageId !== undefined && pageId > zone.when.maxPageId) {
        return false;
    }

    if (!zone.when?.activateAfter?.length) {
        return true;
    }

    const activatedAt = activationMap.get(zone.name);
    return activatedAt !== null && activatedAt !== undefined && pageId >= activatedAt;
};

const resolveActiveZone = (
    profile: NormalizedArabicDictionaryProfile,
    activationMap: Map<string, number | null>,
    pageId: number,
) => {
    let activeZone: NormalizedDictionaryZone | null = null;

    for (const zone of profile.zones) {
        if (pageMatchesZone(zone, activationMap, pageId)) {
            activeZone = zone;
        }
    }

    return activeZone;
};

const createHeadingCandidate = (
    pageStartOffset: number,
    line: DictionaryLine,
    family: HeadingFamily,
    headingClass: DictionaryHeadingClass,
): DictionaryCandidate | null => {
    if (!family.classes.includes(headingClass)) {
        return null;
    }

    const headingText = line.text.trim().slice(HEADING_PREFIX.length).trim();
    if (!family.allowSingleLetter && headingClass === 'entry' && headingText.length <= 1) {
        return null;
    }

    return {
        absoluteIndex: pageStartOffset + line.start,
        contentStartOffset: HEADING_PREFIX.length,
        family: 'heading',
        kind: family.emit,
        lemma: family.emit === 'entry' ? headingText : undefined,
        localIndex: line.start,
        text: line.text.trim(),
    };
};

const optionalSecondWord = (allowMultiWord: boolean) =>
    allowMultiWord ? `(?:\\s+${ARABIC_WORD_WITH_OPTIONAL_MARKS_PATTERN})?` : '';

const wrappedWordPattern = (open: string, close: string, allowMultiWord: boolean) =>
    `${open}${ARABIC_WORD_WITH_OPTIONAL_MARKS_PATTERN}${optionalSecondWord(allowMultiWord)}${close}`;

const STATUS_LINE_RE = new RegExp(
    `^(?:${CODE_LINE_PATTERN}|${ARABIC_WORD_WITH_OPTIONAL_MARKS_PATTERN}(?:\\s*[،,]\\s*${ARABIC_WORD_WITH_OPTIONAL_MARKS_PATTERN})+)\\s*:?[\\s]*${STATUS_TAIL_PATTERN}(?=$|[.،,:؛\\s])`,
    'u',
);

const createLineEntryRegex = (family: LineEntryFamily) => {
    const cached = lineEntryRegexCache.get(family);
    if (cached) {
        return cached;
    }

    const wrapperPattern =
        family.wrappers === 'parentheses'
            ? wrappedWordPattern('\\(', '\\)', family.allowMultiWord)
            : family.wrappers === 'brackets'
              ? wrappedWordPattern('\\[', '\\]', family.allowMultiWord)
              : family.wrappers === 'curly'
                ? wrappedWordPattern('\\{', '\\}', family.allowMultiWord)
                : family.wrappers === 'any'
                  ? `[([{]${ARABIC_WORD_WITH_OPTIONAL_MARKS_PATTERN}${optionalSecondWord(family.allowMultiWord)}[)\\]}]`
                  : `${ARABIC_WORD_WITH_OPTIONAL_MARKS_PATTERN}${optionalSecondWord(family.allowMultiWord)}`;
    const colonSpacing = family.allowWhitespaceBeforeColon ? '\\s*:' : ':';
    const regex = new RegExp(`^(?<lemma>${wrapperPattern})${colonSpacing}`, 'u');
    lineEntryRegexCache.set(family, regex);
    return regex;
};

const collectLineEntryCandidates = (pageStartOffset: number, line: DictionaryLine, family: LineEntryFamily) => {
    const trimmed = line.text.trim();
    if (STATUS_LINE_RE.test(trimmed)) {
        return [] satisfies DictionaryCandidate[];
    }

    const match = trimmed.match(createLineEntryRegex(family));
    if (!match?.groups?.lemma) {
        return [] satisfies DictionaryCandidate[];
    }

    return [
        {
            absoluteIndex: pageStartOffset + line.start,
            family: 'lineEntry',
            kind: 'entry',
            lemma: match.groups.lemma.replace(/^[[{(]+|[\])}]+$/gu, '').trim(),
            localIndex: line.start,
            text: trimmed,
        },
    ] satisfies DictionaryCandidate[];
};

const collectInlineSubentryCandidates = (
    pageStartOffset: number,
    line: DictionaryLine,
    family: InlineSubentryFamily,
): DictionaryCandidate[] => {
    const cached = inlineSubentryRegexCache.get(family);
    const prefixes = family.prefixes.length > 0 ? family.prefixes.join('|') : 'و';
    const regex =
        cached ??
        new RegExp(`(^|[\\s،؛,:.])(?<lemma>(?:${prefixes})${ARABIC_WORD_WITH_OPTIONAL_MARKS_PATTERN})\\s*:`, 'gu');
    if (!cached) {
        inlineSubentryRegexCache.set(family, regex);
    }
    const candidates: DictionaryCandidate[] = [];

    for (const match of line.text.matchAll(regex)) {
        if (!match.groups?.lemma || match.index === undefined) {
            continue;
        }

        const candidateStart = match.index + match[0].length - match.groups.lemma.length - 1;
        const lemma = family.stripPrefixesFromLemma
            ? match.groups.lemma.replace(new RegExp(`^(?:${prefixes})`, 'u'), '')
            : match.groups.lemma;

        candidates.push({
            absoluteIndex: pageStartOffset + line.start + candidateStart,
            family: 'inlineSubentry',
            kind: 'entry',
            lemma,
            localIndex: line.start + candidateStart,
            text: match.groups.lemma,
        });
    }

    return candidates;
};

const collectCodeLineCandidates = (pageStartOffset: number, line: DictionaryLine, _family: CodeLineFamily) => {
    const cached = codeLineRegexCache.get(_family);
    const regex =
        cached ??
        new RegExp(
            `^(?:[[(])?(?<codes>${CODE_LINE_PATTERN})(?:[)\\]])?(?:\\s*:?[\\s]*${STATUS_TAIL_PATTERN}.*)?$`,
            'u',
        );
    if (!cached) {
        codeLineRegexCache.set(_family, regex);
    }
    const match = line.text.trim().match(regex);
    if (!match?.groups?.codes) {
        return [] satisfies DictionaryCandidate[];
    }

    return [
        {
            absoluteIndex: pageStartOffset + line.start,
            family: 'codeLine',
            kind: 'marker',
            lemma: match.groups.codes,
            localIndex: line.start,
            text: line.text.trim(),
        },
    ] satisfies DictionaryCandidate[];
};

const collectPairedFormsCandidates = (pageStartOffset: number, line: DictionaryLine, family: PairedFormsFamily) => {
    const cached = pairedFormsRegexCache.get(family);
    const separator = family.separator === 'space' ? '\\s+' : '\\s*[،,]\\s*';
    const statusTail = family.requireStatusTail ? '\\s*:\\s*(?:مستعمل|مستعملة|مستعملان|مهمل|مهملة).*' : '\\s*:';
    const regex =
        cached ??
        new RegExp(
            `^(?<forms>${ARABIC_WORD_WITH_OPTIONAL_MARKS_PATTERN}(?:${separator}${ARABIC_WORD_WITH_OPTIONAL_MARKS_PATTERN})+)${statusTail}`,
            'u',
        );
    if (!cached) {
        pairedFormsRegexCache.set(family, regex);
    }
    const match = line.text.trim().match(regex);
    if (!match?.groups?.forms) {
        return [] satisfies DictionaryCandidate[];
    }

    return [
        {
            absoluteIndex: pageStartOffset + line.start,
            family: 'pairedForms',
            kind: family.emit,
            lemma: family.emit === 'entry' ? match.groups.forms : undefined,
            localIndex: line.start,
            text: line.text.trim(),
        },
    ] satisfies DictionaryCandidate[];
};

const blockerApplies = (blocker: NormalizedDictionaryBlocker, family: DictionaryFamilyUse) =>
    !blocker.appliesTo || blocker.appliesTo.includes(family);

const isIntroCandidate = (text: string) => {
    const normalized = normalizeIntroContextText(text);
    return INTRO_PHRASES.some((phrase) => normalized.startsWith(normalizeArabicForComparison(phrase)));
};

const endsWithIntroPhrase = (text: string) => {
    const trimmed = text.trimEnd();
    if (STRONG_SENTENCE_TERMINATORS.test(trimmed)) {
        return false;
    }

    const normalized = normalizeIntroContextText(trimmed)
        .trimEnd()
        .replace(/[:؛،,.!?؟]+$/u, '')
        .trimEnd();
    return INTRO_PHRASES.some((phrase) => normalized.endsWith(normalizeArabicForComparison(phrase)));
};

const endsWithIntroContext = (text: string) => {
    const trimmed = text.trimEnd();
    if (STRONG_SENTENCE_TERMINATORS.test(trimmed)) {
        return false;
    }

    const normalized = normalizeIntroContextText(trimmed)
        .trimEnd()
        .replace(/[:؛،,.!?؟]+$/u, '')
        .trimEnd();
    if (!normalized) {
        return false;
    }

    if (INTRO_PHRASES.some((phrase) => normalized.endsWith(normalizeArabicForComparison(phrase)))) {
        return true;
    }

    if (INTRO_TAIL_PHRASES.some((phrase) => normalized.endsWith(normalizeArabicForComparison(phrase)))) {
        return true;
    }

    return INTRO_TAIL_PATTERNS.some((pattern) => pattern.test(normalized));
};

const isAuthorityCandidate = (text: string, precision: 'high' | 'aggressive') => {
    const head = normalizeStopLemma(text.split(':', 1)[0] ?? text);
    if (head && AUTHORITY_HEAD_WORDS.some((term) => normalizeStopLemma(term) === head)) {
        return true;
    }

    if (AUTHORITY_RE.test(text)) {
        return true;
    }

    if (precision === 'aggressive') {
        const normalized = normalizeIntroContextText(text);
        return ['الليث', 'الأزهري', 'الأصمعي', 'الجوهري', 'الفراء', 'ثعلب', 'شمر'].some((term) =>
            normalized.startsWith(normalizeArabicForComparison(term)),
        );
    }

    return false;
};

const hasBlockedQualifierTail = (lemma: string): boolean => {
    const parts = lemma
        .split(/[،,]/u)
        .map((part) => part.trim())
        .filter(Boolean);
    if (parts.length < 2) {
        return false;
    }

    const tail = parts.slice(1).join(' ');
    return startsWithConfiguredWord(QUALIFIER_TAIL_PREFIXES, tail);
};

const looksLikeStructuralLeak = (candidate: DictionaryCandidate): boolean => {
    if (!candidate.lemma) {
        return false;
    }

    const normalizedLemma = normalizeArabicForComparison(candidate.lemma);

    if (
        candidate.kind === 'entry' &&
        (/^[^\p{Script=Arabic}\d]+/u.test(candidate.lemma) ||
            candidate.lemma.includes('{') ||
            candidate.lemma.includes('}') ||
            candidate.lemma.includes('##'))
    ) {
        return true;
    }

    if (
        candidate.kind === 'entry' &&
        BARE_CODE_LEMMA_RE.test(candidate.lemma) &&
        (candidate.text === candidate.lemma ||
            candidate.text === `${HEADING_PREFIX}${candidate.lemma}` ||
            candidate.text.startsWith(`${HEADING_PREFIX}${candidate.lemma}`) ||
            candidate.text.startsWith(`${candidate.lemma}\n${HEADING_PREFIX}`))
    ) {
        return true;
    }

    if (candidate.family !== 'pairedForms' && candidate.lemma.split(/\s+/u).filter(Boolean).length > 4) {
        return true;
    }

    if (startsWithConfiguredWord(STRUCTURAL_LEMMA_PREFIXES, candidate.lemma)) {
        return true;
    }

    if (normalizedLemma.startsWith(normalizeArabicForComparison('ولل'))) {
        return true;
    }

    const structuralText = candidate.text.startsWith(HEADING_PREFIX)
        ? candidate.text.slice(HEADING_PREFIX.length).trim()
        : candidate.text;
    if (/^[\d\u0660-\u0669]+\s*-\s*\([^)]+\)(?:\s+##.*)?$/u.test(structuralText)) {
        return true;
    }

    const normalizedText = normalizeArabicForComparison(structuralText);
    if (STRUCTURAL_LINE_PATTERNS.some((pattern) => pattern.test(structuralText))) {
        return STRUCTURAL_LINE_KEYWORDS.some((keyword) =>
            normalizedText.includes(normalizeArabicForComparison(keyword)),
        );
    }

    return false;
};

const countLemma = (map: Map<string, number>, lemma?: string) => {
    if (!lemma) {
        return;
    }
    map.set(lemma, (map.get(lemma) ?? 0) + 1);
};

const createInitialKindCounts = (): Record<DictionarySegmentKind, number> => ({
    chapter: 0,
    entry: 0,
    marker: 0,
});

const createInitialReasonCounts = (): Record<DictionaryDiagnosticReason, number> => ({
    authorityIntro: 0,
    intro: 0,
    pageContinuation: 0,
    previousChar: 0,
    previousWord: 0,
    qualifierTail: 0,
    stopLemma: 0,
    structuralLeak: 0,
});

const createInitialFamilyCounts = (): DictionaryProfileDiagnostics['familyCounts'] => ({
    codeLine: { accepted: 0, rejected: 0 },
    heading: { accepted: 0, rejected: 0 },
    inlineSubentry: { accepted: 0, rejected: 0 },
    lineEntry: { accepted: 0, rejected: 0 },
    pairedForms: { accepted: 0, rejected: 0 },
});

const rejectsViaIntroBlocker = (
    candidate: DictionaryCandidate,
    blocker: NormalizedDictionaryBlocker,
    localBeforeCandidate: string,
) => {
    if (blocker.use !== 'intro') {
        return false;
    }

    return (
        isIntroCandidate(candidate.text) ||
        endsWithIntroPhrase(localBeforeCandidate) ||
        endsWithIntroContext(localBeforeCandidate)
    );
};

const rejectsViaAuthorityBlocker = (candidate: DictionaryCandidate, blocker: NormalizedDictionaryBlocker) =>
    blocker.use === 'authorityIntro' && isAuthorityCandidate(candidate.text, blocker.precision ?? 'high');

const rejectsViaStopLemmaBlocker = (candidate: DictionaryCandidate, blocker: NormalizedDictionaryBlocker) =>
    blocker.use === 'stopLemma' &&
    !!candidate.lemma &&
    !!normalizeStopLemma(candidate.lemma) &&
    blocker.normalizedWords.includes(normalizeStopLemma(candidate.lemma));

const rejectsViaPreviousWordBlocker = (localBeforeCandidate: string, blocker: NormalizedDictionaryBlocker) => {
    if (blocker.use !== 'previousWord') {
        return false;
    }

    const lastWord = extractLastArabicWord(localBeforeCandidate);
    return !!lastWord && blocker.normalizedWords.includes(normalizeArabicForComparison(lastWord));
};

const rejectsViaPreviousCharBlocker = (localBeforeCandidate: string, blocker: NormalizedDictionaryBlocker) => {
    if (blocker.use !== 'previousChar') {
        return false;
    }

    const previousChar = previousNonWhitespaceChar(localBeforeCandidate);
    return !!previousChar && blocker.charSet.has(previousChar);
};

const rejectsViaPageContinuationBlocker = (
    candidate: DictionaryCandidate,
    blocker: NormalizedDictionaryBlocker,
    localBeforeCandidate: string,
    pageIndex: number,
    pages: Page[],
) => {
    if (blocker.use !== 'pageContinuation') {
        return false;
    }

    const isPageStartCandidate = localBeforeCandidate.trim().length === 0;
    if (!isPageStartCandidate || pageIndex === 0) {
        return false;
    }

    const previousPage = pages[pageIndex - 1];
    if (!previousPage || endsWithStrongSentenceTerminator(previousPage.content)) {
        return false;
    }

    const previousWord = extractLastArabicWord(previousPage.content);
    const previousWordBlocks =
        !!previousWord && CONTINUATION_PREV_WORDS.some((word) => normalizedEquals(word, previousWord));

    return (
        previousWordBlocks ||
        endsWithIntroContext(previousPage.content) ||
        isIntroCandidate(candidate.text) ||
        isAuthorityCandidate(candidate.text, 'high')
    );
};

const getBlockerRejectionReason = (
    blocker: NormalizedDictionaryBlocker,
    candidate: DictionaryCandidate,
    localBeforeCandidate: string,
    pageIndex: number,
    pages: Page[],
): DictionaryDiagnosticReason | null => {
    if (rejectsViaIntroBlocker(candidate, blocker, localBeforeCandidate)) {
        return 'intro';
    }
    if (rejectsViaAuthorityBlocker(candidate, blocker)) {
        return 'authorityIntro';
    }
    if (rejectsViaStopLemmaBlocker(candidate, blocker)) {
        return 'stopLemma';
    }
    if (rejectsViaPreviousWordBlocker(localBeforeCandidate, blocker)) {
        return 'previousWord';
    }
    if (rejectsViaPreviousCharBlocker(localBeforeCandidate, blocker)) {
        return 'previousChar';
    }
    if (rejectsViaPageContinuationBlocker(candidate, blocker, localBeforeCandidate, pageIndex, pages)) {
        return 'pageContinuation';
    }
    return null;
};

const getCandidateRejection = (
    candidate: DictionaryCandidate,
    zone: NormalizedDictionaryZone,
    pageIndex: number,
    pages: Page[],
): RejectionResult | null => {
    const hasQualifierTail = hasBlockedQualifierTail(candidate.lemma ?? '');
    if (hasQualifierTail || looksLikeStructuralLeak(candidate)) {
        return { reason: hasQualifierTail ? 'qualifierTail' : 'structuralLeak' };
    }

    const localBeforeCandidate = pages[pageIndex]!.content.slice(0, candidate.localIndex);

    for (const blocker of zone.blockers) {
        if (!blockerApplies(blocker, candidate.family)) {
            continue;
        }
        const reason = getBlockerRejectionReason(blocker, candidate, localBeforeCandidate, pageIndex, pages);
        if (reason) {
            return { reason };
        }
    }

    return null;
};

const shouldRejectCandidate = (
    candidate: DictionaryCandidate,
    zone: NormalizedDictionaryZone,
    pageIndex: number,
    pages: Page[],
): boolean => {
    return getCandidateRejection(candidate, zone, pageIndex, pages) !== null;
};

const collectHeadingCandidates = (
    pageStartOffset: number,
    line: DictionaryLine,
    family: HeadingFamily,
    trimmed: string,
): DictionaryCandidate[] => {
    if (!trimmed.startsWith(HEADING_PREFIX)) {
        return [];
    }

    const headingClass = classifyDictionaryHeading(trimmed);
    if (headingClass === 'noise') {
        return [];
    }

    const candidate = createHeadingCandidate(pageStartOffset, line, family, headingClass);
    return candidate ? [candidate] : [];
};

const collectCandidatesForFamily = (
    pageStartOffset: number,
    line: DictionaryLine,
    family: NormalizedDictionaryFamily,
    trimmed: string,
): DictionaryCandidate[] => {
    switch (family.use) {
        case 'heading':
            return collectHeadingCandidates(pageStartOffset, line, family, trimmed);
        case 'lineEntry':
            return collectLineEntryCandidates(pageStartOffset, line, family);
        case 'inlineSubentry':
            return collectInlineSubentryCandidates(pageStartOffset, line, family);
        case 'codeLine':
            return collectCodeLineCandidates(pageStartOffset, line, family);
        case 'pairedForms':
            return collectPairedFormsCandidates(pageStartOffset, line, family);
    }
};

const collectCandidatesForLine = (
    pageStartOffset: number,
    line: DictionaryLine,
    zone: NormalizedDictionaryZone,
): DictionaryCandidate[] => {
    const trimmed = line.text.trim();
    const candidates: DictionaryCandidate[] = [];

    for (const family of zone.families) {
        candidates.push(...collectCandidatesForFamily(pageStartOffset, line, family, trimmed));
    }

    return candidates;
};

const candidateToSplitPoint = (candidate: DictionaryCandidate): SplitPoint => ({
    contentStartOffset: candidate.contentStartOffset,
    index: candidate.absoluteIndex,
    meta: candidate.lemma ? { kind: candidate.kind, lemma: candidate.lemma } : { kind: candidate.kind },
});

const pushDiagnosticSample = (
    samples: DictionaryProfileDiagnostics['samples'],
    sampleLimit: number,
    sample: DictionaryProfileDiagnostics['samples'][number],
) => {
    if (samples.length < sampleLimit) {
        samples.push(sample);
    }
};

/**
 * Collects dictionary-profile split points using the pages-only markdown surface.
 */
export const collectDictionarySplitPoints = (
    pages: Page[],
    profile: ArabicDictionaryProfile,
    pageMap: PageMap,
    logger?: Logger,
): SplitPoint[] => {
    const normalizedProfile = normalizeDictionaryProfile(profile);
    const activationMap = createZoneActivationMap(normalizedProfile, pages);
    const splitPoints: SplitPoint[] = [];

    logger?.debug?.('[dictionary] collecting split points', {
        pageCount: pages.length,
        zoneCount: normalizedProfile.zones.length,
    });

    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
        const page = pages[pageIndex]!;
        const zone = resolveActiveZone(normalizedProfile, activationMap, page.id);
        if (!zone) {
            continue;
        }

        const boundary = pageMap.boundaries[pageIndex];
        const lines = buildPageLines(page);

        for (const line of lines) {
            const candidates = collectCandidatesForLine(boundary.start, line, zone);
            for (const candidate of candidates) {
                if (shouldRejectCandidate(candidate, zone, pageIndex, pages)) {
                    continue;
                }
                splitPoints.push(candidateToSplitPoint(candidate));
            }
        }
    }

    logger?.debug?.('[dictionary] collected split points', { splitPointCount: splitPoints.length });

    return splitPoints;
};

/**
 * Collects authoring diagnostics for a dictionary profile without creating segments.
 *
 * This is useful when tuning blockers and family choices for a new dictionary.
 */
export const diagnoseDictionaryProfile = (
    pages: Page[],
    profile: ArabicDictionaryProfile,
    options: DictionaryProfileDiagnosticsOptions = {},
): DictionaryProfileDiagnostics => {
    const normalizedProfile = normalizeDictionaryProfile(profile);
    const activationMap = createZoneActivationMap(normalizedProfile, pages);
    const sampleLimit = options.sampleLimit ?? 50;
    const acceptedKinds = createInitialKindCounts();
    const blockerHits = createInitialReasonCounts();
    const familyCounts = createInitialFamilyCounts();
    const zoneCounts: DictionaryProfileDiagnostics['zoneCounts'] = {};
    const rejectedLemmaCounts = new Map<string, number>();
    const samples: DictionaryProfileDiagnostics['samples'] = [];
    let acceptedCount = 0;
    let rejectedCount = 0;

    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
        const page = pages[pageIndex]!;
        const zone = resolveActiveZone(normalizedProfile, activationMap, page.id);
        if (!zone) {
            continue;
        }

        zoneCounts[zone.name] ??= { accepted: 0, rejected: 0 };

        const lines = buildPageLines(page);
        for (const line of lines) {
            const candidates = collectCandidatesForLine(line.start, line, zone);
            for (const candidate of candidates) {
                const rejection = getCandidateRejection(candidate, zone, pageIndex, pages);
                const sampleBase = {
                    family: candidate.family,
                    kind: candidate.kind,
                    lemma: candidate.lemma,
                    pageId: page.id,
                    text: candidate.text,
                    zone: zone.name,
                };

                if (rejection) {
                    rejectedCount += 1;
                    blockerHits[rejection.reason] += 1;
                    familyCounts[candidate.family].rejected += 1;
                    zoneCounts[zone.name]!.rejected += 1;
                    countLemma(rejectedLemmaCounts, candidate.lemma);
                    pushDiagnosticSample(samples, sampleLimit, {
                        ...sampleBase,
                        accepted: false,
                        reason: rejection.reason,
                    });
                    continue;
                }

                acceptedCount += 1;
                acceptedKinds[candidate.kind] += 1;
                familyCounts[candidate.family].accepted += 1;
                zoneCounts[zone.name]!.accepted += 1;
                pushDiagnosticSample(samples, sampleLimit, { ...sampleBase, accepted: true });
            }
        }
    }

    const rejectedLemmas = [...rejectedLemmaCounts.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .map(([lemma, count]) => ({ count, lemma }));

    return {
        acceptedCount,
        acceptedKinds,
        blockerHits,
        familyCounts,
        pageCount: pages.length,
        rejectedCount,
        rejectedLemmas,
        samples,
        zoneCounts,
    };
};
