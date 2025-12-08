import { describe, expect, it } from 'bun:test';
import {
    anyRuleAllowsId,
    extractNamedCaptures,
    filterByConstraints,
    filterByOccurrence,
    getLastPositionalCapture,
    groupBySpanAndFilter,
    type MatchResult,
} from './match-utils';

describe('match-utils', () => {
    describe('extractNamedCaptures', () => {
        it('should return undefined when groups is undefined', () => {
            expect(extractNamedCaptures(undefined, ['name'])).toBeUndefined();
        });

        it('should return undefined when captureNames is empty', () => {
            expect(extractNamedCaptures({ name: 'value' }, [])).toBeUndefined();
        });

        it('should return undefined when no matching names found', () => {
            expect(extractNamedCaptures({ other: 'value' }, ['name'])).toBeUndefined();
        });

        it('should extract matching named captures', () => {
            const groups = { num: '٦٦٩٦', page: '١٢٣' };
            const result = extractNamedCaptures(groups, ['num', 'page']);
            expect(result).toEqual({ num: '٦٦٩٦', page: '١٢٣' });
        });

        it('should only include requested capture names', () => {
            const groups = { extra: 'ignored', num: '٦٦٩٦', page: '١٢٣' };
            const result = extractNamedCaptures(groups, ['num']);
            expect(result).toEqual({ num: '٦٦٩٦' });
        });

        it('should skip undefined capture values', () => {
            const groups = { num: '٦٦٩٦', page: undefined as unknown as string };
            const result = extractNamedCaptures(groups, ['num', 'page']);
            expect(result).toEqual({ num: '٦٦٩٦' });
        });
    });

    describe('getLastPositionalCapture', () => {
        it('should return undefined for match with no capture groups', () => {
            const match = ['full match'] as unknown as RegExpExecArray;
            match.index = 0;
            match.input = 'test';
            expect(getLastPositionalCapture(match)).toBeUndefined();
        });

        it('should return the last defined capture group', () => {
            const match = ['full', 'first', 'second', 'third'] as unknown as RegExpExecArray;
            match.index = 0;
            match.input = 'test';
            expect(getLastPositionalCapture(match)).toBe('third');
        });

        it('should skip undefined capture groups at the end', () => {
            const match = ['full', 'first', 'second', undefined] as unknown as RegExpExecArray;
            match.index = 0;
            match.input = 'test';
            expect(getLastPositionalCapture(match)).toBe('second');
        });

        it('should return first capture if only one exists', () => {
            const match = ['full', 'only'] as unknown as RegExpExecArray;
            match.index = 0;
            match.input = 'test';
            expect(getLastPositionalCapture(match)).toBe('only');
        });
    });

    describe('filterByConstraints', () => {
        const matches: MatchResult[] = [
            { end: 10, start: 0 },
            { end: 110, start: 100 },
            { end: 210, start: 200 },
        ];
        // Simple ID mapper: offset / 100 gives page ID (0, 1, 2)
        const getId = (offset: number) => Math.floor(offset / 100);

        it('should return all matches when no constraints', () => {
            const result = filterByConstraints(matches, {}, getId);
            expect(result).toHaveLength(3);
        });

        it('should filter by min constraint', () => {
            const result = filterByConstraints(matches, { min: 1 }, getId);
            expect(result).toHaveLength(2);
            expect(result[0].start).toBe(100);
        });

        it('should filter by max constraint', () => {
            const result = filterByConstraints(matches, { max: 1 }, getId);
            expect(result).toHaveLength(2);
            expect(result[1].start).toBe(100);
        });

        it('should filter by both min and max constraints', () => {
            const result = filterByConstraints(matches, { max: 1, min: 1 }, getId);
            expect(result).toHaveLength(1);
            expect(result[0].start).toBe(100);
        });
    });

    describe('filterByOccurrence', () => {
        const matches: MatchResult[] = [
            { end: 10, start: 0 },
            { end: 30, start: 20 },
            { end: 50, start: 40 },
        ];

        it('should return empty array for empty input', () => {
            expect(filterByOccurrence([], 'first')).toEqual([]);
        });

        it('should return first match when occurrence is "first"', () => {
            const result = filterByOccurrence(matches, 'first');
            expect(result).toHaveLength(1);
            expect(result[0].start).toBe(0);
        });

        it('should return last match when occurrence is "last"', () => {
            const result = filterByOccurrence(matches, 'last');
            expect(result).toHaveLength(1);
            expect(result[0].start).toBe(40);
        });

        it('should return all matches when occurrence is "all"', () => {
            expect(filterByOccurrence(matches, 'all')).toEqual(matches);
        });

        it('should return all matches when occurrence is undefined', () => {
            expect(filterByOccurrence(matches, undefined)).toEqual(matches);
        });
    });

    describe('groupBySpanAndFilter', () => {
        // Matches on pages 0, 0, 1, 1, 2
        const matches: MatchResult[] = [
            { end: 10, start: 0 },
            { end: 30, start: 20 },
            { end: 110, start: 100 },
            { end: 130, start: 120 },
            { end: 210, start: 200 },
        ];
        const getId = (offset: number) => Math.floor(offset / 100);

        it('should group by maxSpan=1 and return first of each page', () => {
            const result = groupBySpanAndFilter(matches, 1, 'first', getId);
            expect(result).toHaveLength(3); // One from each page
            expect(result[0].start).toBe(0);
            expect(result[1].start).toBe(100);
            expect(result[2].start).toBe(200);
        });

        it('should group by maxSpan=1 and return last of each page', () => {
            const result = groupBySpanAndFilter(matches, 1, 'last', getId);
            expect(result).toHaveLength(3);
            expect(result[0].start).toBe(20); // Last on page 0
            expect(result[1].start).toBe(120); // Last on page 1
            expect(result[2].start).toBe(200);
        });

        it('should group by maxSpan=2 (pages 0-1 together, 2 separate)', () => {
            const result = groupBySpanAndFilter(matches, 2, 'first', getId);
            expect(result).toHaveLength(2); // Group 0 (pages 0-1) and Group 1 (page 2)
            expect(result[0].start).toBe(0); // First from group 0
            expect(result[1].start).toBe(200); // First from group 1
        });

        it('should return all matches per group when occurrence is undefined', () => {
            const result = groupBySpanAndFilter(matches, 1, undefined, getId);
            expect(result).toHaveLength(5); // All matches returned
        });
    });

    describe('anyRuleAllowsId', () => {
        it('should return true when no constraints exist', () => {
            const rules = [{}];
            expect(anyRuleAllowsId(rules, 5)).toBe(true);
        });

        it('should return true when ID is within min constraint', () => {
            const rules = [{ min: 3 }];
            expect(anyRuleAllowsId(rules, 5)).toBe(true);
        });

        it('should return false when ID is below min constraint', () => {
            const rules = [{ min: 10 }];
            expect(anyRuleAllowsId(rules, 5)).toBe(false);
        });

        it('should return true when ID is within max constraint', () => {
            const rules = [{ max: 10 }];
            expect(anyRuleAllowsId(rules, 5)).toBe(true);
        });

        it('should return false when ID is above max constraint', () => {
            const rules = [{ max: 3 }];
            expect(anyRuleAllowsId(rules, 5)).toBe(false);
        });

        it('should return true when any rule allows the ID', () => {
            const rules = [
                { min: 10 }, // Does not allow 5
                { max: 8 }, // Allows 5
            ];
            expect(anyRuleAllowsId(rules, 5)).toBe(true);
        });

        it('should return false when no rules allow the ID', () => {
            const rules = [{ min: 10 }, { max: 3 }];
            expect(anyRuleAllowsId(rules, 5)).toBe(false);
        });
    });
});
