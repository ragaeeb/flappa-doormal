import { describe, expect, it } from 'bun:test';
import type { SplitRule } from '@/types/rules.js';
import type { PageMap } from '@/types/segmenter.js';
import {
    collectFastFuzzySplitPoints,
    createPageStartGuardChecker,
    partitionRulesForMatching,
} from './segmenter-rule-utils';

const makePageMap = (pages: Array<{ id: number; content: string }>): { matchContent: string; pageMap: PageMap } => {
    const boundaries: PageMap['boundaries'] = [];
    const pageBreaks: number[] = [];
    const parts: string[] = [];
    let offset = 0;

    for (let i = 0; i < pages.length; i++) {
        const normalized = pages[i].content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        boundaries.push({ end: offset + normalized.length, id: pages[i].id, start: offset });
        parts.push(normalized);
        if (i < pages.length - 1) {
            pageBreaks.push(offset + normalized.length);
            offset += normalized.length + 1;
        } else {
            offset += normalized.length;
        }
    }

    const matchContent = parts.join('\n');
    const getId = (off: number) => {
        for (const b of boundaries) {
            if (off >= b.start && off <= b.end) {
                return b.id;
            }
        }
        return boundaries.at(-1)?.id ?? 0;
    };

    return {
        matchContent,
        pageMap: {
            boundaries,
            getId,
            pageBreaks,
            pageIds: boundaries.map((b) => b.id),
        },
    };
};

describe('segmenter-rule-utils', () => {
    describe('partitionRulesForMatching', () => {
        it('should bucket fast-fuzzy token rules and keep non-combinable regex rules standalone', () => {
            const rules: SplitRule[] = [
                { fuzzy: true, lineStartsWith: ['{{naql}}'] },
                { fuzzy: true, lineStartsAfter: ['{{naql}}'] },
                { regex: '^(?<num>[0-9]+)\\s+' }, // named capture => standalone
                { regex: '^(\\w+):\\s*(.+)' }, // anonymous captures => standalone
                { regex: '^ABC' }, // combinable
            ];

            const { combinableRules, fastFuzzyRules, standaloneRules } = partitionRulesForMatching(rules);
            expect(fastFuzzyRules.map((r) => r.ruleIndex)).toEqual([0, 1]);
            expect(fastFuzzyRules[0].kind).toBe('startsWith');
            expect(fastFuzzyRules[1].kind).toBe('startsAfter');

            expect(standaloneRules).toHaveLength(2);
            expect(combinableRules.map((r) => r.index)).toEqual([4]);
        });
    });

    describe('createPageStartGuardChecker', () => {
        it('should allow page-start match only when previous page ends with the guard pattern', () => {
            const { matchContent, pageMap } = makePageMap([
                { content: 'A:', id: 1 }, // not tarqim
                { content: 'B', id: 2 },
            ]);
            const passes = createPageStartGuardChecker(matchContent, pageMap);
            const rule: SplitRule = { lineStartsWith: ['X'], pageStartGuard: '{{tarqim}}' };

            // page 2 start offset is len('A:') + 1 newline = 3
            expect(passes(rule, 0, 3)).toBe(false);

            const { matchContent: matchContent2, pageMap: pageMap2 } = makePageMap([
                { content: 'A.', id: 1 }, // tarqim
                { content: 'B', id: 2 },
            ]);
            const passes2 = createPageStartGuardChecker(matchContent2, pageMap2);
            expect(passes2(rule, 0, 3)).toBe(true);
        });
    });

    describe('collectFastFuzzySplitPoints', () => {
        it('should collect split points at line starts for fast-fuzzy startsWith and startsAfter', () => {
            const { matchContent, pageMap } = makePageMap([{ content: 'أَخْبَرَنَا X\nأَخْبَرَنَا Y', id: 1 }]);

            const rules: SplitRule[] = [
                { fuzzy: true, lineStartsWith: ['{{naql}}'], split: 'at' },
                { fuzzy: true, lineStartsAfter: ['{{naql}}'], split: 'at' },
            ];
            const { fastFuzzyRules } = partitionRulesForMatching(rules);
            const passes = createPageStartGuardChecker(matchContent, pageMap);

            const byRule = collectFastFuzzySplitPoints(matchContent, pageMap, fastFuzzyRules, passes);

            const startsWithPoints = byRule.get(0);
            expect(startsWithPoints?.map((p) => p.index)).toEqual([0, matchContent.indexOf('\n') + 1]);

            const startsAfterPoints = byRule.get(1);
            expect(startsAfterPoints).toHaveLength(2);
            expect(startsAfterPoints?.[0].index).toBe(0);
            expect(startsAfterPoints?.[0].contentStartOffset).toBeDefined();
            expect(matchContent.slice(0 + (startsAfterPoints?.[0].contentStartOffset ?? 0))).toStartWith(' ');
        });
    });
});
