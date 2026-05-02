/**
 * Zone activation, page context construction, and zone resolution for the
 * dictionary runtime.
 */

import type {
    DictionaryGate,
    NormalizedArabicDictionaryProfile,
    NormalizedDictionaryZone,
} from '@/types/dictionary.js';
import type { Page } from '@/types/index.js';
import type { PageMap } from '../types/segmenter.js';
import { normalizeArabicForComparison, normalizeLineEndings } from '../utils/textUtils.js';
import { GATE_DELIMITER_RE, GATE_TOKEN_MAP, HEADING_PREFIX } from './constants.js';

export type DictionaryLine = {
    lineNumber: number;
    start: number;
    text: string;
};

export type PageContext = {
    boundary: NonNullable<PageMap['boundaries'][number]>;
    content: string;
    index: number;
    lines: DictionaryLine[];
    page: Page;
};

const normalizedStartsWith = (text: string, prefix: string): boolean =>
    normalizeArabicForComparison(text).startsWith(normalizeArabicForComparison(prefix));

const isDelimitedPrefixMatch = (text: string, prefix: string) => {
    if (text === prefix) {
        return true;
    }
    if (!text.startsWith(prefix)) {
        return false;
    }
    const nextChar = text[prefix.length];
    return nextChar === undefined || GATE_DELIMITER_RE.test(nextChar);
};

export const buildPageLines = (content: string): DictionaryLine[] => {
    const parts = content.split('\n');
    const lines: DictionaryLine[] = [];
    let offset = 0;

    for (let index = 0; index < parts.length; index++) {
        const text = parts[index] ?? '';
        lines.push({ lineNumber: index + 1, start: offset, text });
        offset += text.length + 1;
    }

    return lines;
};

export const headingMatchesGate = (headingText: string, gate: DictionaryGate): boolean => {
    if (gate.use === 'headingText') {
        const useFuzzy = gate.fuzzy ?? false;
        const source = useFuzzy ? normalizeArabicForComparison(headingText) : headingText.trim();
        const match = useFuzzy ? normalizeArabicForComparison(gate.match) : gate.match.trim();
        return !!match && isDelimitedPrefixMatch(source, match);
    }

    return normalizedStartsWith(headingText, GATE_TOKEN_MAP[gate.token]);
};

const pageMatchesAnyGate = (page: PageContext, gates: DictionaryGate[]) =>
    page.lines.some((line) => {
        const trimmed = line.text.trim();
        if (!trimmed.startsWith(HEADING_PREFIX)) {
            return false;
        }
        const headingText = trimmed.slice(HEADING_PREFIX.length).trim();
        return gates.some((gate) => headingMatchesGate(headingText, gate));
    });

const pageWithinZoneBounds = (zone: NormalizedDictionaryZone, pageId: number) => {
    if (zone.when?.minPageId !== undefined && pageId < zone.when.minPageId) {
        return false;
    }
    if (zone.when?.maxPageId !== undefined && pageId > zone.when.maxPageId) {
        return false;
    }
    return true;
};

const findActivationPageId = (zone: NormalizedDictionaryZone, pages: PageContext[]) => {
    for (const page of pages) {
        if (!pageWithinZoneBounds(zone, page.page.id)) {
            continue;
        }
        if (pageMatchesAnyGate(page, zone.when?.activateAfter ?? [])) {
            return page.page.id;
        }
    }
    return null;
};

export const createZoneActivationMap = (
    profile: NormalizedArabicDictionaryProfile,
    pages: PageContext[],
): Map<string, number | null> => {
    const activation = new Map<string, number | null>();

    for (const zone of profile.zones) {
        if (!zone.when?.activateAfter?.length) {
            activation.set(zone.name, null);
            continue;
        }
        activation.set(zone.name, findActivationPageId(zone, pages));
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

export const resolveActiveZone = (
    profile: NormalizedArabicDictionaryProfile,
    activationMap: Map<string, number | null>,
    pageId: number,
): NormalizedDictionaryZone | null => {
    let activeZone: NormalizedDictionaryZone | null = null;

    for (const zone of profile.zones) {
        if (pageMatchesZone(zone, activationMap, pageId)) {
            activeZone = zone;
        }
    }

    return activeZone;
};

export const createPageContexts = (pages: Page[], pageMap: PageMap, normalizedPages?: string[]): PageContext[] => {
    if (normalizedPages && normalizedPages.length !== pages.length) {
        throw new Error(
            `Dictionary runtime expected ${pages.length} normalized pages, received ${normalizedPages.length}`,
        );
    }
    if (pageMap.boundaries.length !== pages.length) {
        throw new Error(
            `Dictionary runtime expected ${pages.length} page boundaries, received ${pageMap.boundaries.length}`,
        );
    }

    const contexts: PageContext[] = [];
    for (let index = 0; index < pages.length; index++) {
        const page = pages[index];
        const boundary = pageMap.boundaries[index];
        if (!page || !boundary) {
            throw new Error(`Dictionary runtime encountered a missing page or boundary at index ${index}`);
        }

        const content = normalizedPages?.[index] ?? normalizeLineEndings(page.content);
        contexts.push({
            boundary,
            content,
            index,
            lines: buildPageLines(content),
            page,
        });
    }
    return contexts;
};
