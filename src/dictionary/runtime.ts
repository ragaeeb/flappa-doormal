/**
 * Dictionary runtime orchestrator.
 *
 * This module is the entry point for the dictionary segmentation pipeline.
 * All logic has been split into focused sub-modules:
 *
 * - `dictionary-constants`  — phrase lists, regex patterns, keyword arrays
 * - `dictionary-zones`      — PageContext construction, zone activation & resolution
 * - `dictionary-candidates` — per-family candidate generators
 * - `dictionary-blockers`   — blocker evaluation + rejection predicates
 * - `dictionary-diagnostics`— diagnoseDictionaryProfile + counter factories
 *
 * Only the two public exports remain here:
 *   • `collectDictionarySplitPoints` — used by segmentPages
 *   • `diagnoseDictionaryProfile`    — exported from src/index.ts
 */

import type { ArabicDictionaryProfile } from '@/types/dictionary.js';
import type { Page } from '@/types/index.js';
import type { Logger } from '@/types/options.js';
import { mergeDebugIntoMeta } from '../segmentation/debug-meta.js';
import type { PageMap, SplitPoint } from '../types/segmenter.js';
import { shouldRejectCandidate } from './dictionary-blockers.js';
import { collectCandidatesForLine } from './dictionary-candidates.js';
import { createPageContexts, createZoneActivationMap, resolveActiveZone } from './dictionary-zones.js';
import { normalizeDictionaryProfile } from './profile.js';

export { diagnoseDictionaryProfile } from './dictionary-diagnostics.js';

// ──────────────────────────────────────────────────────────────────────────────
// Split point conversion
// ──────────────────────────────────────────────────────────────────────────────

const candidateToSplitPoint = (
    candidate: ReturnType<typeof collectCandidatesForLine>[number],
    debugMetaKey?: string,
): SplitPoint => {
    const baseMeta = candidate.lemma ? { kind: candidate.kind, lemma: candidate.lemma } : { kind: candidate.kind };
    const meta =
        debugMetaKey === undefined
            ? baseMeta
            : mergeDebugIntoMeta(baseMeta, debugMetaKey, {
                  dictionary: {
                      family: candidate.family,
                      ...(candidate.headingClass ? { headingClass: candidate.headingClass } : {}),
                  },
              });

    return {
        contentStartOffset: candidate.contentStartOffset,
        index: candidate.absoluteIndex,
        meta,
    };
};

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Collects dictionary-profile split points using the pages-only markdown surface.
 */
export const collectDictionarySplitPoints = (
    pages: Page[],
    profile: ArabicDictionaryProfile,
    pageMap: PageMap,
    normalizedPages?: string[],
    logger?: Logger,
    debugMetaKey?: string,
): SplitPoint[] => {
    const normalizedProfile = normalizeDictionaryProfile(profile);
    const pageContexts = createPageContexts(pages, pageMap, normalizedPages);
    const activationMap = createZoneActivationMap(normalizedProfile, pageContexts);
    const splitPoints: SplitPoint[] = [];

    logger?.debug?.('[dictionary] collecting split points', {
        pageCount: pages.length,
        zoneCount: normalizedProfile.zones.length,
    });

    for (const pageContext of pageContexts) {
        const zone = resolveActiveZone(normalizedProfile, activationMap, pageContext.page.id);
        if (!zone) {
            continue;
        }

        for (let lineIndex = 0; lineIndex < pageContext.lines.length; lineIndex++) {
            const line = pageContext.lines[lineIndex]!;
            const nextLine = pageContext.lines[lineIndex + 1];
            const candidates = collectCandidatesForLine(pageContext.boundary.start, line, nextLine, zone);
            for (const candidate of candidates) {
                if (shouldRejectCandidate(candidate, zone, pageContext, pageContexts)) {
                    continue;
                }
                splitPoints.push(candidateToSplitPoint(candidate, debugMetaKey));
            }
        }
    }

    logger?.debug?.('[dictionary] collected split points', { splitPointCount: splitPoints.length });

    return splitPoints;
};
