import type { SplitRule } from '@/types/rules.js';
import type { PageMap, SplitPoint } from '@/types/segmenter.js';
import { isPageExcluded } from './breakpoint-utils.js';
import { compileFastFuzzyTokenRule, type FastFuzzyTokenRule, matchFastFuzzyTokenAt } from './fast-fuzzy-prefix.js';
import { extractNamedCaptureNames, hasCapturingGroup, processPattern } from './rule-regex.js';

export type FastFuzzyRule = {
    compiled: FastFuzzyTokenRule;
    rule: SplitRule;
    ruleIndex: number;
    kind: 'startsWith' | 'startsAfter';
};

export type PartitionedRules = {
    combinableRules: Array<{ rule: SplitRule; prefix: string; index: number }>;
    standaloneRules: SplitRule[];
    fastFuzzyRules: FastFuzzyRule[];
};

export const partitionRulesForMatching = (rules: SplitRule[]) => {
    const combinableRules: { rule: SplitRule; prefix: string; index: number }[] = [];
    const standaloneRules: SplitRule[] = [];
    const fastFuzzyRules: FastFuzzyRule[] = [];

    rules.forEach((rule, index) => {
        const fuzzy = (rule as { fuzzy?: boolean }).fuzzy;
        if (fuzzy) {
            if ('lineStartsWith' in rule && rule.lineStartsWith.length === 1) {
                const compiled = compileFastFuzzyTokenRule(rule.lineStartsWith[0]);
                if (compiled) {
                    return fastFuzzyRules.push({ compiled, kind: 'startsWith', rule, ruleIndex: index });
                }
            }
            if ('lineStartsAfter' in rule && rule.lineStartsAfter.length === 1) {
                const compiled = compileFastFuzzyTokenRule(rule.lineStartsAfter[0]);
                if (compiled) {
                    return fastFuzzyRules.push({ compiled, kind: 'startsAfter', rule, ruleIndex: index });
                }
            }
        }

        let isCombinable = true;
        if ('regex' in rule && rule.regex) {
            isCombinable =
                extractNamedCaptureNames(rule.regex).length === 0 &&
                !/\\[1-9]/.test(rule.regex) &&
                !hasCapturingGroup(rule.regex);
        }

        if (isCombinable) {
            combinableRules.push({ index, prefix: `r${index}_`, rule });
        } else {
            standaloneRules.push(rule);
        }
    });

    return { combinableRules, fastFuzzyRules, standaloneRules };
};

export type PageStartGuardChecker = (rule: SplitRule, ruleIndex: number, matchStart: number) => boolean;

export const createPageStartGuardChecker = (matchContent: string, pageMap: PageMap) => {
    const pageStartToBoundaryIndex = new Map(pageMap.boundaries.map((b, i) => [b.start, i]));
    const compiledPageStartPrev = new Map<number, RegExp | null>();

    const getPageStartPrevRegex = (rule: SplitRule, ruleIndex: number) => {
        if (compiledPageStartPrev.has(ruleIndex)) {
            return compiledPageStartPrev.get(ruleIndex) ?? null;
        }
        const pattern = (rule as { pageStartGuard?: string }).pageStartGuard;
        if (!pattern) {
            compiledPageStartPrev.set(ruleIndex, null);
            return null;
        }
        const re = new RegExp(`(?:${processPattern(pattern, false).pattern})$`, 'u');
        compiledPageStartPrev.set(ruleIndex, re);
        return re;
    };

    const getPrevPageLastNonWsChar = (boundaryIndex: number) => {
        if (boundaryIndex <= 0) {
            return '';
        }
        const prevBoundary = pageMap.boundaries[boundaryIndex - 1];
        for (let i = prevBoundary.end - 1; i >= prevBoundary.start; i--) {
            const ch = matchContent[i];
            if (ch && !/\s/u.test(ch)) {
                return ch;
            }
        }
        return '';
    };

    return (rule: SplitRule, ruleIndex: number, matchStart: number) => {
        const boundaryIndex = pageStartToBoundaryIndex.get(matchStart);
        if (boundaryIndex === undefined || boundaryIndex === 0) {
            return true;
        }
        const prevReq = getPageStartPrevRegex(rule, ruleIndex);
        if (!prevReq) {
            return true;
        }
        const lastChar = getPrevPageLastNonWsChar(boundaryIndex);
        return lastChar ? prevReq.test(lastChar) : false;
    };
};

/**
 * Checks if a pageId matches the min/max/exclude constraints of a rule.
 */
const passesRuleConstraints = (rule: SplitRule, pageId: number) =>
    (rule.min === undefined || pageId >= rule.min) &&
    (rule.max === undefined || pageId <= rule.max) &&
    !isPageExcluded(pageId, rule.exclude);

/**
 * Records a split point for a specific rule.
 */
const recordSplitPointAt = (splitPointsByRule: Map<number, SplitPoint[]>, ruleIndex: number, sp: SplitPoint) => {
    const arr = splitPointsByRule.get(ruleIndex);
    if (!arr) {
        splitPointsByRule.set(ruleIndex, [sp]);
    } else {
        arr.push(sp);
    }
};

/**
 * Processes matches for all fast-fuzzy rules at a specific line start.
 */
const processFastFuzzyMatchesAt = (
    matchContent: string,
    lineStart: number,
    pageId: number,
    fastFuzzyRules: FastFuzzyRule[],
    passesPageStartGuard: PageStartGuardChecker,
    isPageStart: boolean,
    splitPointsByRule: Map<number, SplitPoint[]>,
) => {
    for (const { compiled, kind, rule, ruleIndex } of fastFuzzyRules) {
        if (!passesRuleConstraints(rule, pageId)) {
            continue;
        }

        if (isPageStart && !passesPageStartGuard(rule, ruleIndex, lineStart)) {
            continue;
        }

        const end = matchFastFuzzyTokenAt(matchContent, lineStart, compiled);
        if (end === null) {
            continue;
        }

        const splitIndex = (rule.split ?? 'at') === 'at' ? lineStart : end;
        if (kind === 'startsWith') {
            recordSplitPointAt(splitPointsByRule, ruleIndex, { index: splitIndex, meta: rule.meta });
        } else {
            const markerLength = end - lineStart;
            recordSplitPointAt(splitPointsByRule, ruleIndex, {
                contentStartOffset: (rule.split ?? 'at') === 'at' ? markerLength : undefined,
                index: splitIndex,
                meta: rule.meta,
            });
        }
    }
};

export const collectFastFuzzySplitPoints = (
    matchContent: string,
    pageMap: PageMap,
    fastFuzzyRules: FastFuzzyRule[],
    passesPageStartGuard: PageStartGuardChecker,
) => {
    const splitPointsByRule = new Map<number, SplitPoint[]>();
    if (fastFuzzyRules.length === 0 || pageMap.boundaries.length === 0) {
        return splitPointsByRule;
    }

    // Stream page boundary cursor to avoid O(log n) getId calls in hot loop.
    let boundaryIdx = 0;
    let currentBoundary = pageMap.boundaries[boundaryIdx];
    const advanceBoundaryTo = (offset: number) => {
        while (currentBoundary && offset > currentBoundary.end && boundaryIdx < pageMap.boundaries.length - 1) {
            boundaryIdx++;
            currentBoundary = pageMap.boundaries[boundaryIdx];
        }
    };

    const isPageStart = (offset: number) => offset === currentBoundary?.start;

    // Line starts are offset 0 and any char after '\n'
    for (let lineStart = 0; lineStart <= matchContent.length; ) {
        advanceBoundaryTo(lineStart);
        const pageId = currentBoundary?.id ?? 0;

        if (lineStart >= matchContent.length) {
            break;
        }

        processFastFuzzyMatchesAt(
            matchContent,
            lineStart,
            pageId,
            fastFuzzyRules,
            passesPageStartGuard,
            isPageStart(lineStart),
            splitPointsByRule,
        );

        const nextNl = matchContent.indexOf('\n', lineStart);
        if (nextNl === -1) {
            break;
        }
        lineStart = nextNl + 1;
    }

    return splitPointsByRule;
};
