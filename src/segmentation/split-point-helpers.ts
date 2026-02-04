/**
 * Helper module for collectSplitPointsFromRules to reduce complexity.
 * Handles combined regex matching and split point creation.
 */

import type { Logger } from '@/types/options.js';
import type { SplitRule } from '@/types/rules.js';
import type { PageMap, SplitPoint } from '../types/segmenter.js';
import { isPageExcluded } from './breakpoint-utils.js';
import { buildRuleDebugPatch, mergeDebugIntoMeta } from './debug-meta.js';
import {
    extractDebugIndex,
    extractNamedCaptures,
    filterByConstraints,
    getLastPositionalCapture,
    type MatchResult,
} from './match-utils.js';
import { buildRuleRegex, type RuleRegex } from './rule-regex.js';

// Maximum iterations before throwing to prevent infinite loops
const MAX_REGEX_ITERATIONS = 100000;

type CombinableRule = { rule: SplitRule; prefix: string; index: number };

type RuleRegexInfo = RuleRegex & { prefix: string; source: string };

// Combined regex matching

const extractNamedCapturesForRule = (
    groups: Record<string, string> | undefined,
    captureNames: string[],
    prefix: string,
) => {
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

const passesRuleConstraints = (rule: SplitRule, pageId: number) =>
    (rule.min === undefined || pageId >= rule.min) &&
    (rule.max === undefined || pageId <= rule.max) &&
    !isPageExcluded(pageId, rule.exclude);

const createSplitPointFromMatch = (match: RegExpExecArray, rule: SplitRule, ruleInfo: RuleRegexInfo): SplitPoint => {
    const namedCaptures = extractNamedCapturesForRule(match.groups, ruleInfo.captureNames, ruleInfo.prefix);
    const wordIndex = extractDebugIndex(match.groups, '_r');

    return {
        capturedContent: undefined,
        contentStartOffset: buildContentOffsets(match, ruleInfo).contentStartOffset,
        index: (rule.split ?? 'at') === 'at' ? match.index : match.index + match[0].length,
        meta: rule.meta,
        namedCaptures: Object.keys(namedCaptures).length > 0 ? namedCaptures : undefined,
        wordIndex,
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
) => {
    const combinedSource = ruleRegexes.map((r) => r.source).join('|');
    const combinedRegex = new RegExp(combinedSource, 'gm');

    logger?.debug?.('[segmenter] combined regex built', {
        combinableRuleCount: combinableRules.length,
        combinedSourceLength: combinedSource.length,
    });

    let m = combinedRegex.exec(matchContent);
    let iterations = 0;

    while (m !== null) {
        if (++iterations > MAX_REGEX_ITERATIONS) {
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
            if (
                passesRuleConstraints(rule, pageMap.getId(m.index)) &&
                passesPageStartGuard(rule, originalIndex, m.index)
            ) {
                const arr = splitPointsByRule.get(originalIndex);
                if (!arr) {
                    splitPointsByRule.set(originalIndex, [
                        createSplitPointFromMatch(m, rule, ruleRegexes[matchedIndex]),
                    ]);
                } else {
                    arr.push(createSplitPointFromMatch(m, rule, ruleRegexes[matchedIndex]));
                }
            }
        }
        if (m[0].length === 0) {
            combinedRegex.lastIndex++;
        }
        m = combinedRegex.exec(matchContent);
    }
};

export const buildRuleRegexes = (combinableRules: CombinableRule[]) =>
    combinableRules.map(({ rule, prefix }) => {
        const built = buildRuleRegex(rule, prefix);
        return { ...built, prefix, source: `(?<${prefix}>${built.regex.source})` };
    });

export const processStandaloneRule = (
    rule: SplitRule,
    ruleIndex: number,
    matchContent: string,
    pageMap: PageMap,
    passesPageStartGuard: (rule: SplitRule, index: number, pos: number) => boolean,
    splitPointsByRule: Map<number, SplitPoint[]>,
) => {
    const { regex, usesCapture, captureNames, usesLineStartsAfter } = buildRuleRegex(rule);
    const allMatches = findMatchesInContent(matchContent, regex, usesCapture, captureNames);
    const constrained = filterByConstraints(allMatches, rule, pageMap.getId);
    const points = constrained
        .filter((m) => passesPageStartGuard(rule, ruleIndex, m.start))
        .map((m) => {
            const isLSA = usesLineStartsAfter && m.captured !== undefined;
            return {
                capturedContent: isLSA ? undefined : m.captured,
                contentStartOffset: isLSA ? m.end - m.captured!.length - m.start : undefined,
                index: (rule.split ?? 'at') === 'at' ? m.start : m.end,
                meta: rule.meta,
                namedCaptures: m.namedCaptures,
                wordIndex: m.wordIndex,
            };
        });

    const arr = splitPointsByRule.get(ruleIndex);
    if (!arr) {
        splitPointsByRule.set(ruleIndex, points);
    } else {
        arr.push(...points);
    }
};

const findMatchesInContent = (content: string, regex: RegExp, usesCapture: boolean, captureNames: string[]) => {
    const matches: MatchResult[] = [];
    let m = regex.exec(content);

    while (m !== null) {
        const wordIndex = extractDebugIndex(m.groups, '_r');

        matches.push({
            captured: usesCapture ? getLastPositionalCapture(m) : undefined,
            end: m.index + m[0].length,
            namedCaptures: extractNamedCaptures(m.groups, captureNames),
            start: m.index,
            wordIndex,
        });
        if (m[0].length === 0) {
            regex.lastIndex++;
        }
        m = regex.exec(content);
    }

    return matches;
};

// Occurrence filtering

export const applyOccurrenceFilter = (
    rules: SplitRule[],
    splitPointsByRule: Map<number, SplitPoint[]>,
    debugMetaKey?: string,
) => {
    const result: SplitPoint[] = [];

    rules.forEach((rule, index) => {
        const points = splitPointsByRule.get(index);
        if (!points?.length) {
            return;
        }

        const filtered =
            rule.occurrence === 'first' ? [points[0]] : rule.occurrence === 'last' ? [points.at(-1)!] : points;

        result.push(
            ...filtered.map((p) => {
                const debugPatch = debugMetaKey ? buildRuleDebugPatch(index, rule, p.wordIndex) : null;
                return {
                    ...p,
                    meta: debugMetaKey ? mergeDebugIntoMeta(p.meta, debugMetaKey, debugPatch!) : p.meta,
                    ruleIndex: index,
                };
            }),
        );
    });
    return result;
};
