import { describe, expect, it } from 'bun:test';
import type { SplitRule } from '@/types/rules.js';
import type { PageMap, SplitPoint } from '../types/segmenter.js';
import {
    applyOccurrenceFilter,
    buildRuleRegexes,
    processCombinedMatches,
    processStandaloneRule,
} from './split-point-helpers.js';

const createSinglePageMap = (contentLength: number): PageMap => ({
    boundaries: [{ end: contentLength, id: 0, start: 0 }],
    getId: () => 0,
    pageBreaks: [],
    pageIds: [0],
});

describe('split-point-helpers', () => {
    it('should build wrapped regex sources for combinable rules', () => {
        const regexes = buildRuleRegexes([{ index: 0, prefix: 'r0', rule: { lineStartsWith: ['باب'] } }]);

        expect(regexes).toHaveLength(1);
        expect(regexes[0]?.prefix).toBe('r0');
        expect(regexes[0]?.source).toContain('(?<r0>');
    });

    it('should collect combined split points for lineStartsAfter rules', () => {
        const content = '## alpha\n## beta';
        const splitPointsByRule = new Map<number, SplitPoint[]>();
        const combinableRules = [{ index: 0, prefix: 'r0', rule: { lineStartsAfter: ['## '] } }];

        processCombinedMatches(
            content,
            combinableRules,
            buildRuleRegexes(combinableRules),
            createSinglePageMap(content.length),
            () => true,
            splitPointsByRule,
        );

        const points = splitPointsByRule.get(0);
        expect(points).toHaveLength(2);
        expect(points?.[0]?.index).toBe(0);
        expect(points?.[0]?.contentStartOffset).toBeGreaterThan(0);
        expect(points?.[1]?.index).toBe(9);
    });

    it('should reject combined-rule arrays whose lengths do not align', () => {
        const combinableRules = [{ index: 0, prefix: 'r0', rule: { lineStartsWith: ['باب'] } }];

        expect(() =>
            processCombinedMatches(
                'باب',
                combinableRules,
                [],
                createSinglePageMap(3),
                () => true,
                new Map<number, SplitPoint[]>(),
            ),
        ).toThrow('processCombinedMatches: combinableRules/ruleRegexes length mismatch');
    });

    it('should reject combined regexes whose named-group prefixes do not align', () => {
        const combinableRules = [{ index: 0, prefix: 'r0', rule: { lineStartsWith: ['باب'] } }];
        const [regexInfo] = buildRuleRegexes(combinableRules);

        expect(() =>
            processCombinedMatches(
                'باب',
                combinableRules,
                [{ ...regexInfo, source: regexInfo.source.replace('(?<r0>', '(?:') }],
                createSinglePageMap(3),
                () => true,
                new Map<number, SplitPoint[]>(),
            ),
        ).toThrow('processCombinedMatches: regex alignment mismatch for prefix "r0" at index 0');
    });

    it('should advance zero-length combined matches and emit a high-iteration warning', () => {
        const content = '\n'.repeat(10005);
        const warnings: Array<{ iterations: number; position: number }> = [];
        const splitPointsByRule = new Map<number, SplitPoint[]>();
        const combinableRules = [{ index: 0, prefix: 'r0', rule: { regex: '^' } }];

        processCombinedMatches(
            content,
            combinableRules,
            buildRuleRegexes(combinableRules),
            createSinglePageMap(content.length),
            () => true,
            splitPointsByRule,
            {
                warn: (_message, data) => warnings.push(data as { iterations: number; position: number }),
            },
        );

        expect(splitPointsByRule.get(0)?.length).toBeGreaterThan(10000);
        expect(warnings).toEqual([{ iterations: 10000, position: 9999 }]);
    });

    it('should stop pathological zero-length combined matches at the iteration guard', () => {
        const content = '\n'.repeat(100001);
        const combinableRules = [{ index: 0, prefix: 'r0', rule: { regex: '^' } }];

        expect(() =>
            processCombinedMatches(
                content,
                combinableRules,
                buildRuleRegexes(combinableRules),
                createSinglePageMap(content.length),
                () => true,
                new Map<number, SplitPoint[]>(),
            ),
        ).toThrow('Possible infinite loop: exceeded 100000 iterations');
    });

    it('should append standalone matches into an existing split-point bucket', () => {
        const splitPointsByRule = new Map<number, SplitPoint[]>([[0, [{ index: -1, meta: { seed: true } }]]]);

        processStandaloneRule(
            { lineStartsWith: ['beta'] },
            0,
            'alpha\nbeta',
            createSinglePageMap(10),
            () => true,
            splitPointsByRule,
        );

        const points = splitPointsByRule.get(0);
        expect(points).toHaveLength(2);
        expect(points?.[0]?.index).toBe(-1);
        expect(points?.[1]?.index).toBe(6);
    });

    it('should apply occurrence filtering and attach debug metadata patches', () => {
        const rules: SplitRule[] = [{ lineStartsWith: ['باب'], meta: { kind: 'chapter' }, occurrence: 'last' }];
        const splitPointsByRule = new Map<number, SplitPoint[]>([
            [
                0,
                [
                    { index: 1, meta: { ordinal: 1 }, wordIndex: 0 },
                    { index: 5, meta: { ordinal: 2 }, wordIndex: 0 },
                ],
            ],
        ]);

        const filtered = applyOccurrenceFilter(rules, splitPointsByRule, '_flappa');

        expect(filtered).toHaveLength(1);
        expect(filtered[0]?.index).toBe(5);
        expect(filtered[0]?.ruleIndex).toBe(0);
        expect(filtered[0]?.meta).toMatchObject({
            _flappa: {
                rule: {
                    index: 0,
                    patternType: 'lineStartsWith',
                    word: 'باب',
                    wordIndex: 0,
                },
            },
            ordinal: 2,
        });
    });
});
