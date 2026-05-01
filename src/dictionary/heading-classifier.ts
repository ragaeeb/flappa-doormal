import type { DictionaryHeadingScanClass } from '@/types/dictionary.js';
import { ARABIC_WORD_WITH_OPTIONAL_MARKS_PATTERN, getTokenPattern } from '../segmentation/tokens.js';
import { normalizeArabicForComparison } from '../utils/textUtils.js';

export type DictionarySurfaceKind =
    | DictionaryHeadingScanClass
    | 'lineEntry'
    | 'inlineSubentry'
    | 'codeLine'
    | 'pairedForms';

export type DictionarySurfaceMatch = {
    kind: DictionarySurfaceKind;
    pageId: number;
    text: string;
    lemma?: string;
    line: number;
};

export type DictionaryMarkdownPage = {
    content: string;
    id: number;
};

export type DictionarySurfaceReport = {
    counts: Record<DictionarySurfaceKind, number>;
    matches: DictionarySurfaceMatch[];
};

const HEADING_PREFIX = '## ';
const CODE_LINE_PATTERN = getTokenPattern('harfs').replaceAll('\\s+', '[ \\t]+');
const ARABIC_WORD_PATTERN = ARABIC_WORD_WITH_OPTIONAL_MARKS_PATTERN;

const PLAIN_ENTRY_RE = new RegExp(
    `^(?<lemma>${ARABIC_WORD_PATTERN}(?:\\s+${ARABIC_WORD_PATTERN}){0,1}|[([{]${ARABIC_WORD_PATTERN}(?:\\s+${ARABIC_WORD_PATTERN}){0,1}[)\\]}])\\s*:`,
    'u',
);
const INLINE_SUBENTRY_RE = new RegExp(`(^|[\\s،؛,:.])(?<lemma>و${ARABIC_WORD_PATTERN})\\s*:`, 'gu');
const CODE_LINE_RE = new RegExp(`^(?:[[(])?(?<codes>${CODE_LINE_PATTERN})(?:[)\\]])?$`, 'u');
const PAIRED_FORMS_RE = new RegExp(
    `^(?<forms>${ARABIC_WORD_PATTERN}(?:\\s*[،,]\\s*${ARABIC_WORD_PATTERN})+)\\s*:`,
    'u',
);
const ARABIC_BOUNDARY_OR_PUNCTUATION = '(?=$|[\\s:،؛()\\[\\]{}\\-–—]|[^\\p{Script=Arabic}])';
const CHAPTER_HEADING_RE = new RegExp(
    `^(?:[([{]\\s*)?(?:باب|فصل|كتاب|حرف|أبواب)${ARABIC_BOUNDARY_OR_PUNCTUATION}`,
    'u',
);
const CLUSTER_HEADING_RE = new RegExp(
    `^(?:\\(?\\s*)?(?:أبواب|أبنية)${ARABIC_BOUNDARY_OR_PUNCTUATION}|^(?=.{1,80}$).+?[،,].+?(?:مستعمل|مهمل|مستعملة|مستعملان)(?=$|[.،,:؛\\s])`,
    'u',
);
const STATUS_HEADING_RE = new RegExp(
    `^(?:${CODE_LINE_PATTERN}|(?:(?:${ARABIC_WORD_PATTERN}\\s+){1,3}${ARABIC_WORD_PATTERN}|${ARABIC_WORD_PATTERN}(?:\\s*[،,]\\s*${ARABIC_WORD_PATTERN})+))\\s*:?[\\s]*(?:مستعمل|مستعملة|مستعملان|مهمل|مهملة)(?=$|[.،,:؛\\s])`,
    'u',
);
const CODE_NOTE_HEADING_RE = new RegExp(`^(?:${ARABIC_WORD_PATTERN}\\s+){1,3}\\(.+\\)$`, 'u');
const COLON_NOISE_RE = /^.+:\s*.+$/u;
const CHAPTER_TERMS = ['باب', 'فصل', 'كتاب', 'حرف', 'أبواب'];
const MARKER_PREFIXES = ['بسم الله', 'توكلت على الله', 'آخر كتاب', 'ويتلوه'];
const NOISE_TOKENS = ['قال', 'وقيل', 'ويقال', 'وفي', 'يعني', 'فإذا'];

const emptyCounts = (): Record<DictionarySurfaceKind, number> => ({
    chapter: 0,
    cluster: 0,
    codeLine: 0,
    entry: 0,
    inlineSubentry: 0,
    lineEntry: 0,
    marker: 0,
    noise: 0,
    pairedForms: 0,
});

const extractWrappedLemma = (lemma: string): string => lemma.replace(/^[[{(]+|[\])}]+$/gu, '').trim();

const stripLeadingWrappers = (text: string): string => text.replace(/^[[{(]+\s*/u, '').trim();

const isDelimitedPrefixMatch = (text: string, prefix: string): boolean => {
    if (text === prefix) {
        return true;
    }
    if (!text.startsWith(prefix)) {
        return false;
    }
    const nextChar = text[prefix.length];
    return nextChar === undefined || /[\s:،؛()[\]{}\-–—]/u.test(nextChar);
};

const isCodeHeading = (text: string): boolean => {
    if (CODE_LINE_RE.test(text)) {
        return true;
    }

    const words = text.trim().split(/\s+/u).filter(Boolean);
    return words.length === 1 && (words[0]?.length ?? 0) === 1;
};

const looksLikeNoiseHeading = (text: string): boolean => {
    const normalized = normalizeArabicForComparison(text);
    const wordCount = text.trim().split(/\s+/u).filter(Boolean).length;

    if (/(?:مستعمل|مهمل|مستعملة|مستعملان)(?=$|[.،,:؛\s])/u.test(text)) {
        return false;
    }

    if (wordCount >= 8 && COLON_NOISE_RE.test(text)) {
        return true;
    }

    return NOISE_TOKENS.some((token) => normalized.includes(normalizeArabicForComparison(token))) && wordCount >= 4;
};

/**
 * Classifies a markdown heading line produced by `convertContentToMarkdown()`.
 */
export const classifyDictionaryHeading = (line: string): DictionaryHeadingScanClass => {
    const text = line.startsWith(HEADING_PREFIX) ? line.slice(HEADING_PREFIX.length).trim() : line.trim();
    const unwrapped = stripLeadingWrappers(text);

    if (!text) {
        return 'noise';
    }

    if (
        CHAPTER_HEADING_RE.test(text) ||
        CHAPTER_TERMS.some((term) =>
            isDelimitedPrefixMatch(normalizeArabicForComparison(unwrapped), normalizeArabicForComparison(term)),
        )
    ) {
        return 'chapter';
    }

    if (looksLikeNoiseHeading(text)) {
        return 'noise';
    }

    if (isCodeHeading(text)) {
        return 'marker';
    }

    if (
        MARKER_PREFIXES.some((token) =>
            normalizeArabicForComparison(unwrapped).startsWith(normalizeArabicForComparison(token)),
        )
    ) {
        return 'marker';
    }

    if (STATUS_HEADING_RE.test(text) || CODE_NOTE_HEADING_RE.test(text)) {
        return 'marker';
    }

    if (CLUSTER_HEADING_RE.test(text)) {
        return 'cluster';
    }

    return 'entry';
};

const createHeadingMatch = (
    kind: DictionaryHeadingScanClass,
    page: DictionaryMarkdownPage,
    rawLine: string,
    lineNumber: number,
): DictionarySurfaceMatch => ({
    kind,
    lemma: kind === 'entry' ? rawLine.slice(HEADING_PREFIX.length).trim() : undefined,
    line: lineNumber,
    pageId: page.id,
    text: rawLine,
});

const createSurfaceMatch = (
    kind: 'lineEntry' | 'pairedForms' | 'codeLine' | 'inlineSubentry',
    page: DictionaryMarkdownPage,
    text: string,
    lineNumber: number,
    lemma?: string,
): DictionarySurfaceMatch => ({
    kind,
    lemma,
    line: lineNumber,
    pageId: page.id,
    text,
});

const scanHeadingLine = (
    page: DictionaryMarkdownPage,
    rawLine: string,
    lineNumber: number,
    matches: DictionarySurfaceMatch[],
): boolean => {
    if (!rawLine.startsWith(HEADING_PREFIX)) {
        return false;
    }

    const kind = classifyDictionaryHeading(rawLine);
    matches.push(createHeadingMatch(kind, page, rawLine, lineNumber));
    return true;
};

const scanLineEntry = (
    page: DictionaryMarkdownPage,
    rawLine: string,
    lineNumber: number,
    matches: DictionarySurfaceMatch[],
): void => {
    const lineEntry = rawLine.match(PLAIN_ENTRY_RE);
    if (!lineEntry?.groups?.lemma) {
        return;
    }

    matches.push(
        createSurfaceMatch('lineEntry', page, rawLine, lineNumber, extractWrappedLemma(lineEntry.groups.lemma)),
    );
};

const scanPairedForms = (
    page: DictionaryMarkdownPage,
    rawLine: string,
    lineNumber: number,
    matches: DictionarySurfaceMatch[],
): void => {
    const pairedForms = rawLine.match(PAIRED_FORMS_RE);
    if (!pairedForms?.groups?.forms) {
        return;
    }

    matches.push(createSurfaceMatch('pairedForms', page, rawLine, lineNumber, pairedForms.groups.forms));
};

const scanCodeLine = (
    page: DictionaryMarkdownPage,
    rawLine: string,
    lineNumber: number,
    matches: DictionarySurfaceMatch[],
): void => {
    const codeLine = rawLine.match(CODE_LINE_RE);
    if (!codeLine?.groups?.codes) {
        return;
    }

    matches.push(createSurfaceMatch('codeLine', page, rawLine, lineNumber, codeLine.groups.codes));
};

const scanInlineSubentries = (
    page: DictionaryMarkdownPage,
    rawLine: string,
    lineNumber: number,
    matches: DictionarySurfaceMatch[],
): void => {
    for (const match of rawLine.matchAll(INLINE_SUBENTRY_RE)) {
        if (!match.groups?.lemma) {
            continue;
        }

        matches.push(createSurfaceMatch('inlineSubentry', page, match.groups.lemma, lineNumber, match.groups.lemma));
    }
};

/**
 * Extracts dictionary surface matches from a markdown page.
 */
export const scanDictionaryMarkdownPage = (page: DictionaryMarkdownPage): DictionarySurfaceMatch[] => {
    const lines = page.content.split(/\n/u);
    const matches: DictionarySurfaceMatch[] = [];

    for (let index = 0; index < lines.length; index++) {
        const rawLine = lines[index]?.trim() ?? '';
        if (!rawLine) {
            continue;
        }

        if (scanHeadingLine(page, rawLine, index + 1, matches)) {
            continue;
        }

        scanLineEntry(page, rawLine, index + 1, matches);
        scanPairedForms(page, rawLine, index + 1, matches);
        scanCodeLine(page, rawLine, index + 1, matches);
        scanInlineSubentries(page, rawLine, index + 1, matches);
    }

    return matches;
};

/**
 * Aggregates dictionary surface counts across markdown pages.
 */
export const analyzeDictionaryMarkdownPages = (pages: DictionaryMarkdownPage[]): DictionarySurfaceReport => {
    const counts = emptyCounts();
    const matches: DictionarySurfaceMatch[] = [];

    for (const page of pages) {
        const pageMatches = scanDictionaryMarkdownPage(page);
        for (const match of pageMatches) {
            counts[match.kind] += 1;
            matches.push(match);
        }
    }

    return { counts, matches };
};
