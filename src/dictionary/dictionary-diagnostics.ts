/**
 * Diagnostics aggregation for the dictionary runtime.
 *
 * `diagnoseDictionaryProfile` runs the same candidate collection and blocker
 * evaluation pipeline as `collectDictionarySplitPoints` but accumulates
 * statistics and samples instead of producing split points.
 */

import type {
    ArabicDictionaryProfile,
    DictionaryDiagnosticReason,
    DictionaryFamilyUse,
    DictionaryProfileDiagnostics,
    DictionaryProfileDiagnosticsOptions,
    DictionarySegmentKind,
} from '@/types/dictionary.js';
import type { Page } from '@/types/index.js';
import type { PageMap } from '../types/segmenter.js';
import { normalizeLineEndings } from '../utils/textUtils.js';
import { getCandidateRejection } from './dictionary-blockers.js';
import { collectCandidatesForLine } from './dictionary-candidates.js';
import { createPageContexts, createZoneActivationMap, resolveActiveZone } from './dictionary-zones.js';
import { normalizeDictionaryProfile } from './profile.js';

export const createInitialKindCounts = (): Record<DictionarySegmentKind, number> => ({
    chapter: 0,
    entry: 0,
    marker: 0,
});

export const createInitialReasonCounts = (): Record<DictionaryDiagnosticReason, number> => ({
    authorityIntro: 0,
    intro: 0,
    pageContinuation: 0,
    previousChar: 0,
    previousWord: 0,
    qualifierTail: 0,
    stopLemma: 0,
    structuralLeak: 0,
});

export const createInitialFamilyCounts = (): DictionaryProfileDiagnostics['familyCounts'] => ({
    codeLine: { accepted: 0, rejected: 0 },
    heading: { accepted: 0, rejected: 0 },
    inlineSubentry: { accepted: 0, rejected: 0 },
    lineEntry: { accepted: 0, rejected: 0 },
    pairedForms: { accepted: 0, rejected: 0 },
});

const countLemma = (map: Map<string, number>, lemma?: string) => {
    if (!lemma) {
        return;
    }
    map.set(lemma, (map.get(lemma) ?? 0) + 1);
};

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
 * Builds a minimal `PageMap` from a pages array for use inside
 * `diagnoseDictionaryProfile`, which does not receive one from the segmenter.
 */
const buildDiagnosticsPageMap = (pages: Page[], normalizedContents: string[]): PageMap => {
    const boundaries: PageMap['boundaries'] = [];
    const pageBreaks: number[] = [];
    let offset = 0;

    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
        const normalized = normalizedContents[pageIndex]!;
        boundaries.push({ end: offset + normalized.length, id: pages[pageIndex]!.id, start: offset });
        if (pageIndex < pages.length - 1) {
            pageBreaks.push(offset + normalized.length);
            offset += normalized.length + 1;
        } else {
            offset += normalized.length;
        }
    }

    const findBoundary = (off: number) => {
        let lo = 0;
        let hi = boundaries.length - 1;
        while (lo <= hi) {
            const mid = (lo + hi) >>> 1;
            const boundary = boundaries[mid];
            if (off < boundary.start) {
                hi = mid - 1;
                continue;
            }
            if (off > boundary.end) {
                lo = mid + 1;
                continue;
            }
            return boundary;
        }
        return boundaries.at(-1);
    };

    return {
        boundaries,
        getId: (off) => findBoundary(off)?.id ?? 0,
        pageBreaks,
        pageIds: pages.map((page) => page.id),
    };
};

/**
 * Collects tuning-oriented diagnostics for a dictionary profile without creating
 * segments. This output is intended for profile authoring workflows rather than
 * long-term compatibility guarantees.
 *
 * This is useful when tuning blockers and family choices for a new dictionary.
 */
export const diagnoseDictionaryProfile = (
    pages: Page[],
    profile: ArabicDictionaryProfile,
    options: DictionaryProfileDiagnosticsOptions = {},
): DictionaryProfileDiagnostics => {
    const normalizedProfile = normalizeDictionaryProfile(profile);
    const normalizedPages = pages.map((page) => normalizeLineEndings(page.content));
    const pageMap = buildDiagnosticsPageMap(pages, normalizedPages);
    const pageContexts = createPageContexts(pages, pageMap, normalizedPages);
    const activationMap = createZoneActivationMap(normalizedProfile, pageContexts);

    const sampleLimit = options.sampleLimit ?? 50;
    const acceptedKinds = createInitialKindCounts();
    const rejectionReasons = createInitialReasonCounts();
    const familyCounts = createInitialFamilyCounts();
    const zoneCounts: DictionaryProfileDiagnostics['zoneCounts'] = {};
    const rejectedLemmaCounts = new Map<string, number>();
    const samples: DictionaryProfileDiagnostics['samples'] = [];
    let acceptedCount = 0;
    let rejectedCount = 0;

    for (const pageContext of pageContexts) {
        const zone = resolveActiveZone(normalizedProfile, activationMap, pageContext.page.id);
        if (!zone) {
            continue;
        }

        zoneCounts[zone.name] ??= { accepted: 0, rejected: 0 };

        for (let lineIndex = 0; lineIndex < pageContext.lines.length; lineIndex++) {
            const line = pageContext.lines[lineIndex]!;
            const nextLine = pageContext.lines[lineIndex + 1];
            const candidates = collectCandidatesForLine(pageContext.boundary.start, line, nextLine, zone);
            for (const candidate of candidates) {
                const rejection = getCandidateRejection(candidate, zone, pageContext, pageContexts);
                const sampleBase = {
                    absoluteIndex: candidate.absoluteIndex,
                    family: candidate.family as DictionaryFamilyUse,
                    kind: candidate.kind,
                    lemma: candidate.lemma,
                    line: candidate.lineNumber,
                    pageId: pageContext.page.id,
                    text: candidate.text,
                    zone: zone.name,
                };

                if (rejection) {
                    rejectedCount += 1;
                    rejectionReasons[rejection.reason] += 1;
                    familyCounts[candidate.family as DictionaryFamilyUse].rejected += 1;
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
                familyCounts[candidate.family as DictionaryFamilyUse].accepted += 1;
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
        familyCounts,
        pageCount: pages.length,
        rejectedCount,
        rejectedLemmas,
        rejectionReasons,
        samples,
        zoneCounts,
    };
};
