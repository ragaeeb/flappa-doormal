import { isPageExcluded } from './breakpoint-utils.js';
import { compileFastFuzzyTokenRule, type FastFuzzyTokenRule, matchFastFuzzyTokenAt } from './fast-fuzzy-prefix.js';
import { extractNamedCaptureNames, hasCapturingGroup, processPattern } from './rule-regex.js';
import type { PageMap, SplitPoint } from './segmenter-types.js';
import type { SplitRule } from './types.js';

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

export const partitionRulesForMatching = (rules: SplitRule[]): PartitionedRules => {
    const combinableRules: { rule: SplitRule; prefix: string; index: number }[] = [];
    const standaloneRules: SplitRule[] = [];
    const fastFuzzyRules: FastFuzzyRule[] = [];

    // Separate rules into combinable, standalone, and fast-fuzzy
    rules.forEach((rule, index) => {
        // Fast-path: fuzzy + lineStartsWith + single token pattern like {{kitab}}
        if ((rule as { fuzzy?: boolean }).fuzzy && 'lineStartsWith' in rule) {
            const compiled =
                rule.lineStartsWith.length === 1 ? compileFastFuzzyTokenRule(rule.lineStartsWith[0]) : null;
            if (compiled) {
                fastFuzzyRules.push({ compiled, kind: 'startsWith', rule, ruleIndex: index });
                return; // handled by fast path
            }
        }

        // Fast-path: fuzzy + lineStartsAfter + single token pattern like {{naql}}
        if ((rule as { fuzzy?: boolean }).fuzzy && 'lineStartsAfter' in rule) {
            const compiled =
                rule.lineStartsAfter.length === 1 ? compileFastFuzzyTokenRule(rule.lineStartsAfter[0]) : null;
            if (compiled) {
                fastFuzzyRules.push({ compiled, kind: 'startsAfter', rule, ruleIndex: index });
                return; // handled by fast path
            }
        }

        let isCombinable = true;

        // Raw regex rules are combinable ONLY if they don't use named captures, backreferences, or anonymous captures
        if ('regex' in rule && rule.regex) {
            const hasNamedCaptures = extractNamedCaptureNames(rule.regex).length > 0;
            const hasBackreferences = /\\[1-9]/.test(rule.regex);
            const hasAnonymousCaptures = hasCapturingGroup(rule.regex);
            if (hasNamedCaptures || hasBackreferences || hasAnonymousCaptures) {
                isCombinable = false;
            }
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

export const createPageStartGuardChecker = (matchContent: string, pageMap: PageMap): PageStartGuardChecker => {
    const pageStartToBoundaryIndex = new Map<number, number>();
    for (let i = 0; i < pageMap.boundaries.length; i++) {
        pageStartToBoundaryIndex.set(pageMap.boundaries[i].start, i);
    }

    const compiledPageStartPrev = new Map<number, RegExp | null>();
    const getPageStartPrevRegex = (rule: SplitRule, ruleIndex: number): RegExp | null => {
        if (compiledPageStartPrev.has(ruleIndex)) {
            return compiledPageStartPrev.get(ruleIndex) ?? null;
        }
        const pattern = (rule as { pageStartGuard?: string }).pageStartGuard;
        if (!pattern) {
            compiledPageStartPrev.set(ruleIndex, null);
            return null;
        }
        const expanded = processPattern(pattern, false).pattern;
        const re = new RegExp(`(?:${expanded})$`, 'u');
        compiledPageStartPrev.set(ruleIndex, re);
        return re;
    };

    const getPrevPageLastNonWsChar = (boundaryIndex: number): string => {
        if (boundaryIndex <= 0) {
            return '';
        }
        const prevBoundary = pageMap.boundaries[boundaryIndex - 1];
        // prevBoundary.end points at the inserted page-break newline; the last content char is end-1.
        for (let i = prevBoundary.end - 1; i >= prevBoundary.start; i--) {
            const ch = matchContent[i];
            if (!ch) {
                continue;
            }
            if (/\s/u.test(ch)) {
                continue;
            }
            return ch;
        }
        return '';
    };

    return (rule: SplitRule, ruleIndex: number, matchStart: number): boolean => {
        const boundaryIndex = pageStartToBoundaryIndex.get(matchStart);
        if (boundaryIndex === undefined || boundaryIndex === 0) {
            return true; // not a page start, or the very first page
        }
        const prevReq = getPageStartPrevRegex(rule, ruleIndex);
        if (!prevReq) {
            return true;
        }
        const lastChar = getPrevPageLastNonWsChar(boundaryIndex);
        if (!lastChar) {
            return false;
        }
        return prevReq.test(lastChar);
    };
};

/**
 * Checks if a pageId matches the min/max/exclude constraints of a rule.
 */
const passesRuleConstraints = (rule: SplitRule, pageId: number): boolean => {
    return (
        (rule.min === undefined || pageId >= rule.min) &&
        (rule.max === undefined || pageId <= rule.max) &&
        !isPageExcluded(pageId, rule.exclude)
    );
};

/**
 * Records a split point for a specific rule.
 */
const recordSplitPointAt = (splitPointsByRule: Map<number, SplitPoint[]>, ruleIndex: number, sp: SplitPoint) => {
    const arr = splitPointsByRule.get(ruleIndex);
    if (!arr) {
        splitPointsByRule.set(ruleIndex, [sp]);
        return;
    }
    arr.push(sp);
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

    const isPageStart = (offset: number): boolean => offset === currentBoundary?.start;

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
