/**
 * Candidate generation for each dictionary family type.
 *
 * Each `collect*Candidates` function examines a single DictionaryLine and
 * returns zero or more DictionaryCandidate objects.  Regex compilation is
 * cached per family object so that repeated calls within a segmentation run
 * are cheap.
 */

import type {
    DictionaryHeadingClass,
    DictionaryHeadingScanClass,
    DictionarySegmentKind,
    NormalizedDictionaryFamily,
    NormalizedDictionaryZone,
} from '@/types/dictionary.js';
import { ARABIC_WORD_WITH_OPTIONAL_MARKS_PATTERN } from '../segmentation/tokens.js';
import { escapeRegex } from '../utils/textUtils.js';
import { CODE_LINE_PATTERN, HEADING_PREFIX, STATUS_TAIL_PATTERN } from './constants.js';
import type { DictionaryLine } from './dictionary-zones.js';
import { classifyDictionaryHeading } from './heading-classifier.js';

export type DictionaryFamilyUse = NormalizedDictionaryFamily['use'];

type HeadingFamily = Extract<NormalizedDictionaryFamily, { use: 'heading' }>;
type LineEntryFamily = Extract<NormalizedDictionaryFamily, { use: 'lineEntry' }>;
type InlineSubentryFamily = Extract<NormalizedDictionaryFamily, { use: 'inlineSubentry' }>;
type CodeLineFamily = Extract<NormalizedDictionaryFamily, { use: 'codeLine' }>;
type PairedFormsFamily = Extract<NormalizedDictionaryFamily, { use: 'pairedForms' }>;

export type DictionaryCandidate = {
    absoluteIndex: number;
    contentStartOffset?: number;
    family: DictionaryFamilyUse;
    headingClass?: DictionaryHeadingScanClass;
    kind: DictionarySegmentKind;
    lemma?: string;
    lineNumber: number;
    localIndex: number;
    probeText: string;
    text: string;
};

const lineEntryRegexCache = new WeakMap<LineEntryFamily, RegExp>();
const inlineSubentryRegexCache = new WeakMap<InlineSubentryFamily, { matchRegex: RegExp; stripPrefixRegex: RegExp }>();
const pairedFormsRegexCache = new WeakMap<PairedFormsFamily, RegExp>();

const STATUS_LINE_RE = new RegExp(
    `^(?:${CODE_LINE_PATTERN}|${ARABIC_WORD_WITH_OPTIONAL_MARKS_PATTERN}(?:\\s*[،,]\\s*${ARABIC_WORD_WITH_OPTIONAL_MARKS_PATTERN})+)\\s*:?[\\s]*${STATUS_TAIL_PATTERN}(?=$|[.،,:؛\\s])`,
    'u',
);

const CODE_CORE_RE = new RegExp(`^${CODE_LINE_PATTERN}$`, 'u');
const STATUS_SUFFIX_RE = new RegExp(`(?:\\s*:?[\\s]*${STATUS_TAIL_PATTERN}.*)?$`, 'u');

const optionalSecondWord = (allowMultiWord: boolean) =>
    allowMultiWord ? `(?:\\s+${ARABIC_WORD_WITH_OPTIONAL_MARKS_PATTERN})?` : '';

const wrappedWordPattern = (open: string, close: string, allowMultiWord: boolean) =>
    `${open}${ARABIC_WORD_WITH_OPTIONAL_MARKS_PATTERN}${optionalSecondWord(allowMultiWord)}${close}`;

const bareWordPattern = (allowMultiWord: boolean) =>
    `${ARABIC_WORD_WITH_OPTIONAL_MARKS_PATTERN}${optionalSecondWord(allowMultiWord)}`;

const createLineEntryRegex = (family: LineEntryFamily): RegExp => {
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
                  ? `(?:${wrappedWordPattern('\\(', '\\)', family.allowMultiWord)}|${wrappedWordPattern('\\[', '\\]', family.allowMultiWord)}|${wrappedWordPattern('\\{', '\\}', family.allowMultiWord)})`
                  : bareWordPattern(family.allowMultiWord);
    const colonSpacing = family.allowWhitespaceBeforeColon ? '\\s*:' : ':';
    const regex = new RegExp(`^(?<lemma>${wrapperPattern})${colonSpacing}`, 'u');
    lineEntryRegexCache.set(family, regex);
    return regex;
};

const parseWrappedCode = (text: string) => {
    const paired = text.match(/^(?<open>[[(])(?<inner>.+)(?<close>[)\]])$/u);
    if (!paired?.groups?.inner || !paired.groups.open || !paired.groups.close) {
        return null;
    }
    return {
        close: paired.groups.close,
        inner: paired.groups.inner.trim(),
        open: paired.groups.open,
        paired:
            (paired.groups.open === '(' && paired.groups.close === ')') ||
            (paired.groups.open === '[' && paired.groups.close === ']'),
    };
};

const collectHeadingCandidates = (
    pageStartOffset: number,
    line: DictionaryLine,
    nextLine: DictionaryLine | undefined,
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

    const candidate = createHeadingCandidate(pageStartOffset, line, nextLine, family, headingClass);
    return candidate ? [candidate] : [];
};

const createHeadingCandidate = (
    pageStartOffset: number,
    line: DictionaryLine,
    nextLine: DictionaryLine | undefined,
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
    if (headingClass === 'entry' && !family.allowNextLineColon && nextLine?.text.trimStart().startsWith(':')) {
        return null;
    }

    return {
        absoluteIndex: pageStartOffset + line.start,
        contentStartOffset: HEADING_PREFIX.length,
        family: 'heading',
        headingClass,
        kind: family.emit,
        lemma: family.emit === 'entry' ? headingText : undefined,
        lineNumber: line.lineNumber,
        localIndex: line.start,
        probeText: line.text.trim(),
        text: line.text.trim(),
    };
};

const collectLineEntryCandidates = (
    pageStartOffset: number,
    line: DictionaryLine,
    family: LineEntryFamily,
): DictionaryCandidate[] => {
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
            lineNumber: line.lineNumber,
            localIndex: line.start,
            probeText: trimmed,
            text: trimmed,
        },
    ] satisfies DictionaryCandidate[];
};

const collectInlineSubentryCandidates = (
    pageStartOffset: number,
    line: DictionaryLine,
    family: InlineSubentryFamily,
): DictionaryCandidate[] => {
    let cached = inlineSubentryRegexCache.get(family);
    if (!cached) {
        const prefixes = family.prefixes.length > 0 ? family.prefixes.map(escapeRegex).join('|') : escapeRegex('و');
        cached = {
            matchRegex: new RegExp(
                `(^|[\\s،؛,:.])(?<lemma>(?:${prefixes})${ARABIC_WORD_WITH_OPTIONAL_MARKS_PATTERN})\\s*:`,
                'gu',
            ),
            stripPrefixRegex: new RegExp(`^(?:${prefixes})`, 'u'),
        };
        inlineSubentryRegexCache.set(family, cached);
    }
    const candidates: DictionaryCandidate[] = [];

    for (const match of line.text.matchAll(cached.matchRegex)) {
        if (!match.groups?.lemma || match.index === undefined) {
            continue;
        }

        const lemmaIndex = match[0].indexOf(match.groups.lemma);
        if (lemmaIndex < 0) {
            continue;
        }
        const candidateStart = match.index + lemmaIndex;
        const lemma = family.stripPrefixesFromLemma
            ? match.groups.lemma.replace(cached.stripPrefixRegex, '')
            : match.groups.lemma;

        candidates.push({
            absoluteIndex: pageStartOffset + line.start + candidateStart,
            family: 'inlineSubentry',
            kind: 'entry',
            lemma,
            lineNumber: line.lineNumber,
            localIndex: line.start + candidateStart,
            probeText: line.text.slice(candidateStart).trimStart(),
            text: line.text.trim(),
        });
    }

    return candidates;
};

const collectCodeLineCandidates = (
    pageStartOffset: number,
    line: DictionaryLine,
    family: CodeLineFamily,
): DictionaryCandidate[] => {
    const trimmed = line.text.trim();
    const bare = trimmed.replace(STATUS_SUFFIX_RE, '').trim();
    const wrapped = parseWrappedCode(bare);
    const inner = wrapped?.inner ?? bare;

    if (!CODE_CORE_RE.test(inner)) {
        return [] satisfies DictionaryCandidate[];
    }

    const wrapperAllowed =
        family.wrappers === 'either'
            ? true
            : family.wrappers === 'none'
              ? wrapped === null
              : family.wrappers === 'paired'
                ? wrapped?.paired === true
                : wrapped !== null && !wrapped.paired;

    if (!wrapperAllowed) {
        return [] satisfies DictionaryCandidate[];
    }

    return [
        {
            absoluteIndex: pageStartOffset + line.start,
            family: 'codeLine',
            kind: 'marker',
            lemma: inner,
            lineNumber: line.lineNumber,
            localIndex: line.start,
            probeText: trimmed,
            text: trimmed,
        },
    ] satisfies DictionaryCandidate[];
};

const collectPairedFormsCandidates = (
    pageStartOffset: number,
    line: DictionaryLine,
    family: PairedFormsFamily,
): DictionaryCandidate[] => {
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
            lineNumber: line.lineNumber,
            localIndex: line.start,
            probeText: line.text.trim(),
            text: line.text.trim(),
        },
    ] satisfies DictionaryCandidate[];
};

const assertNever = (value: never): never => {
    throw new Error(`Unhandled dictionary candidate family: ${JSON.stringify(value)}`);
};

const collectCandidatesForFamily = (
    pageStartOffset: number,
    line: DictionaryLine,
    nextLine: DictionaryLine | undefined,
    family: NormalizedDictionaryFamily,
    trimmed: string,
): DictionaryCandidate[] => {
    switch (family.use) {
        case 'heading':
            return collectHeadingCandidates(pageStartOffset, line, nextLine, family, trimmed);
        case 'lineEntry':
            return collectLineEntryCandidates(pageStartOffset, line, family);
        case 'inlineSubentry':
            return collectInlineSubentryCandidates(pageStartOffset, line, family);
        case 'codeLine':
            return collectCodeLineCandidates(pageStartOffset, line, family);
        case 'pairedForms':
            return collectPairedFormsCandidates(pageStartOffset, line, family);
        default:
            return assertNever(family);
    }
};

/**
 * Collects all family candidates for a single dictionary line within a zone.
 */
export const collectCandidatesForLine = (
    pageStartOffset: number,
    line: DictionaryLine,
    nextLine: DictionaryLine | undefined,
    zone: NormalizedDictionaryZone,
): DictionaryCandidate[] => {
    const trimmed = line.text.trim();
    if (!trimmed) {
        return [];
    }

    const candidates: DictionaryCandidate[] = [];
    for (const family of zone.families) {
        candidates.push(...collectCandidatesForFamily(pageStartOffset, line, nextLine, family, trimmed));
    }

    return candidates;
};
