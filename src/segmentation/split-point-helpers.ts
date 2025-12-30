/**
 * Helper module for collectSplitPointsFromRules to reduce complexity.
 * Handles combined regex matching and split point creation.
 */

import { isPageExcluded } from './breakpoint-utils.js';
import {
    extractNamedCaptures,
    filterByConstraints,
    getLastPositionalCapture,
    type MatchResult,
} from './match-utils.js';
import { buildRuleRegex, type RuleRegex } from './rule-regex.js';
import type { PageMap, SplitPoint } from './segmenter-types.js';
import type { Logger, SplitRule } from './types.js';
import { buildRuleDebugPatch, mergeDebugIntoMeta } from './debug-meta.js';

// Maximum iterations before throwing to prevent infinite loops
const MAX_REGEX_ITERATIONS = 100000;

type CombinableRule = { rule: SplitRule; prefix: string; index: number };

type RuleRegexInfo = RuleRegex & { prefix: string; source: string };

// ─────────────────────────────────────────────────────────────
// Combined regex matching
// ─────────────────────────────────────────────────────────────

const extractNamedCapturesForRule = (
    groups: Record<string, string> | undefined,
    captureNames: string[],
    prefix: string,
): Record<string, string> => {
    const result: Record<string, string> = {};
    if (!groups) {
        return result;
    }
    for (const name of captureNames) {
        if (groups[name] !== undefined) {
            result[name.slice(prefix.length)] = groups[name];
        }
    }
    return result;
};

const buildContentOffsets = (
    match: RegExpExecArray,
    ruleInfo: RuleRegexInfo,
): { capturedContent?: string; contentStartOffset?: number } => {
    if (!ruleInfo.usesLineStartsAfter) {
        return {};
    }

    const captured = match.groups?.[`${ruleInfo.prefix}__content`];
    if (captured === undefined) {
        return {};
    }

    const fullMatch = match.groups?.[ruleInfo.prefix] || match[0];
    return { contentStartOffset: fullMatch.length - captured.length };
};

const passesRuleConstraints = (rule: SplitRule, pageId: number): boolean =>
    (rule.min === undefined || pageId >= rule.min) &&
    (rule.max === undefined || pageId <= rule.max) &&
    !isPageExcluded(pageId, rule.exclude);

const createSplitPointFromMatch = (match: RegExpExecArray, rule: SplitRule, ruleInfo: RuleRegexInfo): SplitPoint => {
    const namedCaptures = extractNamedCapturesForRule(match.groups, ruleInfo.captureNames, ruleInfo.prefix);
    const { contentStartOffset } = buildContentOffsets(match, ruleInfo);

    return {
        capturedContent: undefined,
        contentStartOffset,
        index: (rule.split ?? 'at') === 'at' ? match.index : match.index + match[0].length,
        meta: rule.meta,
        namedCaptures: Object.keys(namedCaptures).length > 0 ? namedCaptures : undefined,
    };
};

export const processCombinedMatches = (
    matchContent: string,
    combinableRules: CombinableRule[],
    ruleRegexes: RuleRegexInfo[],
    pageMap: PageMap,
    passesPageStartGuard: (rule: SplitRule, index: number, pos: number) => boolean,
    splitPointsByRule: Map<number, SplitPoint[]>,
    logger?: Logger,
): void => {
    const combinedSource = ruleRegexes.map((r) => r.source).join('|');
    const combinedRegex = new RegExp(combinedSource, 'gm');

    logger?.debug?.('[segmenter] combined regex built', {
        combinableRuleCount: combinableRules.length,
        combinedSourceLength: combinedSource.length,
    });

    let m = combinedRegex.exec(matchContent);
    let iterations = 0;

    while (m !== null) {
        iterations++;

        if (iterations > MAX_REGEX_ITERATIONS) {
            throw new Error(
                `[segmenter] Possible infinite loop: exceeded ${MAX_REGEX_ITERATIONS} iterations at position ${m.index}.`,
            );
        }

        if (iterations % 10000 === 0) {
            logger?.warn?.('[segmenter] high iteration count', { iterations, position: m.index });
        }

        const matchedIndex = combinableRules.findIndex(({ prefix }) => m?.groups?.[prefix] !== undefined);

        if (matchedIndex !== -1) {
            const { rule, index: originalIndex } = combinableRules[matchedIndex];
            const ruleInfo = ruleRegexes[matchedIndex];
            const pageId = pageMap.getId(m.index);

            if (passesRuleConstraints(rule, pageId) && passesPageStartGuard(rule, originalIndex, m.index)) {
                const sp = createSplitPointFromMatch(m, rule, ruleInfo);

                if (!splitPointsByRule.has(originalIndex)) {
                    splitPointsByRule.set(originalIndex, []);
                }
                splitPointsByRule.get(originalIndex)!.push(sp);
            }
        }

        if (m[0].length === 0) {
            combinedRegex.lastIndex++;
        }
        m = combinedRegex.exec(matchContent);
    }
};

export const buildRuleRegexes = (combinableRules: CombinableRule[]): RuleRegexInfo[] =>
    combinableRules.map(({ rule, prefix }) => {
        const built = buildRuleRegex(rule, prefix);
        return { ...built, prefix, source: `(?<${prefix}>${built.regex.source})` };
    });

// ─────────────────────────────────────────────────────────────
// Standalone rule processing
// ─────────────────────────────────────────────────────────────

export const processStandaloneRule = (
    rule: SplitRule,
    ruleIndex: number,
    matchContent: string,
    pageMap: PageMap,
    passesPageStartGuard: (rule: SplitRule, index: number, pos: number) => boolean,
    splitPointsByRule: Map<number, SplitPoint[]>,
): void => {
    const { regex, usesCapture, captureNames, usesLineStartsAfter } = buildRuleRegex(rule);
    const allMatches = findMatchesInContent(matchContent, regex, usesCapture, captureNames);
    const constrained = filterByConstraints(allMatches, rule, pageMap.getId);
    const guarded = constrained.filter((m) => passesPageStartGuard(rule, ruleIndex, m.start));

    const points = guarded.map((m) => {
        const isLSA = usesLineStartsAfter && m.captured !== undefined;
        const markerLen = isLSA ? m.end - m.captured!.length - m.start : 0;
        return {
            capturedContent: isLSA ? undefined : m.captured,
            contentStartOffset: isLSA ? markerLen : undefined,
            index: (rule.split ?? 'at') === 'at' ? m.start : m.end,
            meta: rule.meta,
            namedCaptures: m.namedCaptures,
        };
    });

    if (!splitPointsByRule.has(ruleIndex)) {
        splitPointsByRule.set(ruleIndex, []);
    }
    splitPointsByRule.get(ruleIndex)!.push(...points);
};

const findMatchesInContent = (
    content: string,
    regex: RegExp,
    usesCapture: boolean,
    captureNames: string[],
): MatchResult[] => {
    const matches: MatchResult[] = [];
    let m = regex.exec(content);

    while (m !== null) {
        matches.push({
            captured: usesCapture ? getLastPositionalCapture(m) : undefined,
            end: m.index + m[0].length,
            namedCaptures: extractNamedCaptures(m.groups, captureNames),
            start: m.index,
        });
        if (m[0].length === 0) {
            regex.lastIndex++;
        }
        m = regex.exec(content);
    }

    return matches;
};

// ─────────────────────────────────────────────────────────────
// Occurrence filtering
// ─────────────────────────────────────────────────────────────

export const applyOccurrenceFilter = (
    rules: SplitRule[],
    splitPointsByRule: Map<number, SplitPoint[]>,
    debugMetaKey?: string,
): SplitPoint[] => {
    const result: SplitPoint[] = [];

    rules.forEach((rule, index) => {
        const points = splitPointsByRule.get(index);
        if (!points?.length) {
            return;
        }

        const filtered =
            rule.occurrence === 'first' ? [points[0]] : rule.occurrence === 'last' ? [points.at(-1)!] : points;

        if (!debugMetaKey) {
            result.push(...filtered.map((p) => ({ ...p, ruleIndex: index })));
            return;
        }

        const debugPatch = buildRuleDebugPatch(index, rule);
        result.push(
            ...filtered.map((p) => ({
                ...p,
                meta: mergeDebugIntoMeta(p.meta, debugMetaKey, debugPatch),
                ruleIndex: index,
            })),
        );
    });

    return result;
};
