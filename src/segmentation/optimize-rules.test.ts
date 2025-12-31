import { describe, expect, it } from 'bun:test';

import { optimizeRules } from './optimize-rules.js';
import type { SplitRule } from './types.js';

describe('optimizeRules', () => {
    describe('merging', () => {
        it('merges lineStartsWith rules when meta and other props are equal', () => {
            const rules: SplitRule[] = [
                { lineStartsWith: ['a'], meta: { type: 'x' } },
                { lineStartsWith: ['b'], meta: { type: 'x' } },
            ];
            const { mergedCount, rules: result } = optimizeRules(rules);
            expect(mergedCount).toBe(1);
            expect(result).toHaveLength(1);
            expect((result[0] as any).lineStartsWith).toEqual(['a', 'b']);
        });

        it('merges lineStartsAfter rules with identical options', () => {
            const rules: SplitRule[] = [
                { lineStartsAfter: ['{{raqms}}'], split: 'at' },
                { lineStartsAfter: ['{{numbered}}'], split: 'at' },
            ];
            const { mergedCount, rules: result } = optimizeRules(rules);
            expect(mergedCount).toBe(1);
            expect(result).toHaveLength(1);
            expect((result[0] as any).lineStartsAfter).toContain('{{raqms}}');
            expect((result[0] as any).lineStartsAfter).toContain('{{numbered}}');
        });

        it('merges lineEndsWith rules with identical options', () => {
            const rules: SplitRule[] = [
                { lineEndsWith: ['.'], split: 'after' },
                { lineEndsWith: ['?'], split: 'after' },
            ];
            const { mergedCount, rules: result } = optimizeRules(rules);
            expect(mergedCount).toBe(1);
            expect(result).toHaveLength(1);
        });

        it('does not merge when meta differs', () => {
            const rules: SplitRule[] = [
                { lineStartsWith: ['a'], meta: { type: 'x' } },
                { lineStartsWith: ['b'], meta: { type: 'y' } },
            ];
            const { mergedCount, rules: result } = optimizeRules(rules);
            expect(mergedCount).toBe(0);
            expect(result).toHaveLength(2);
        });

        it('does not merge when fuzzy differs', () => {
            const rules: SplitRule[] = [
                { fuzzy: true, lineStartsWith: ['a'] },
                { fuzzy: false, lineStartsWith: ['b'] },
            ];
            const { rules: result } = optimizeRules(rules);
            expect(result).toHaveLength(2);
        });

        it('does not merge when pageStartGuard differs', () => {
            const rules: SplitRule[] = [
                { lineStartsWith: ['a'], pageStartGuard: '{{tarqim}}' },
                { lineStartsWith: ['b'] },
            ];
            const { rules: result } = optimizeRules(rules);
            expect(result).toHaveLength(2);
        });

        it('does not merge when min/max differs', () => {
            const rules: SplitRule[] = [
                { lineStartsWith: ['a'], min: 1 },
                { lineStartsWith: ['b'], min: 2 },
                { lineStartsWith: ['c'], max: 10 },
                { lineStartsWith: ['d'], max: 11 },
            ];
            const { rules: result } = optimizeRules(rules);
            expect(result).toHaveLength(4);
        });

        it('does not merge when split/occurrence differs', () => {
            const rules: SplitRule[] = [
                { lineStartsWith: ['a'], occurrence: 'all', split: 'at' },
                { lineStartsWith: ['b'], occurrence: 'all', split: 'after' },
                { lineStartsWith: ['c'], occurrence: 'first', split: 'at' },
            ];
            const { rules: result } = optimizeRules(rules);
            expect(result).toHaveLength(3);
        });

        it('does not merge when exclude differs', () => {
            const rules: SplitRule[] = [
                { exclude: [1], lineStartsWith: ['a'] },
                { exclude: [2], lineStartsWith: ['b'] },
            ];
            const { rules: result } = optimizeRules(rules);
            expect(result).toHaveLength(2);
        });

        it('does not merge across pattern types', () => {
            const rules: SplitRule[] = [
                { lineStartsWith: ['a'] },
                { lineStartsAfter: ['b'] },
                { lineEndsWith: ['c'] },
                { template: '{{tarqim}}' },
                { regex: '^x+' },
            ];
            const { rules: result } = optimizeRules(rules);
            expect(result).toHaveLength(5);
        });

        it('does not merge template rules', () => {
            const rules: SplitRule[] = [
                { split: 'at', template: '{{raqms}}' },
                { split: 'at', template: '{{dash}}' },
            ];
            const { mergedCount, rules: result } = optimizeRules(rules);
            expect(mergedCount).toBe(0);
            expect(result).toHaveLength(2);
        });

        it('does not merge regex rules', () => {
            const rules: SplitRule[] = [
                { regex: '^\\d+', split: 'at' },
                { regex: '^\\w+', split: 'at' },
            ];
            const { mergedCount, rules: result } = optimizeRules(rules);
            expect(mergedCount).toBe(0);
            expect(result).toHaveLength(2);
        });
    });

    describe('deduplication and pattern sorting', () => {
        it('dedupes and sorts merged patterns by length (desc)', () => {
            const rules: SplitRule[] = [{ lineStartsWith: ['aa', 'a'] }, { lineStartsWith: ['a', 'aaaa'] }];
            const { rules: result } = optimizeRules(rules);
            expect((result[0] as any).lineStartsWith).toEqual(['aaaa', 'aa', 'a']);
        });

        it('removes duplicate patterns', () => {
            const rules: SplitRule[] = [{ lineStartsWith: ['a', 'b', 'a'] }, { lineStartsWith: ['b', 'c'] }];
            const { rules: result } = optimizeRules(rules);
            expect((result[0] as any).lineStartsWith).toEqual(['a', 'b', 'c']);
        });
    });

    describe('specificity sorting', () => {
        it('sorts rules by specificity (longer patterns first)', () => {
            const rules: SplitRule[] = [
                { lineStartsWith: ['a'], meta: { i: 1 } },
                { lineStartsWith: ['aaaa'], meta: { i: 2 } },
                { template: 'xx' },
            ];
            const { rules: result } = optimizeRules(rules);
            expect((result[0] as any).lineStartsWith).toEqual(['aaaa']);
            expect((result[1] as any).template).toBe('xx');
            expect((result[2] as any).lineStartsWith).toEqual(['a']);
        });

        it('sorts template rules by pattern length', () => {
            const rules: SplitRule[] = [{ template: 'short' }, { template: 'much longer template' }];
            const { rules: result } = optimizeRules(rules);
            expect((result[0] as any).template).toBe('much longer template');
            expect((result[1] as any).template).toBe('short');
        });

        it('sorts regex rules by pattern length', () => {
            const rules: SplitRule[] = [{ regex: '^a' }, { regex: '^[a-z]+\\s*\\d+' }];
            const { rules: result } = optimizeRules(rules);
            expect((result[0] as any).regex).toBe('^[a-z]+\\s*\\d+');
        });
    });

    describe('edge cases', () => {
        it('handles empty rules array', () => {
            const { mergedCount, rules: result } = optimizeRules([]);
            expect(mergedCount).toBe(0);
            expect(result).toEqual([]);
        });

        it('handles single rule', () => {
            const rules: SplitRule[] = [{ lineStartsWith: ['a'] }];
            const { mergedCount, rules: result } = optimizeRules(rules);
            expect(mergedCount).toBe(0);
            expect(result).toHaveLength(1);
        });

        it('preserves all rule options after merge', () => {
            const rules: SplitRule[] = [
                { fuzzy: true, lineStartsWith: ['a'], meta: { type: 'test' }, min: 5, split: 'at' },
                { fuzzy: true, lineStartsWith: ['b'], meta: { type: 'test' }, min: 5, split: 'at' },
            ];
            const { rules: result } = optimizeRules(rules);
            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({
                fuzzy: true,
                meta: { type: 'test' },
                min: 5,
                split: 'at',
            });
        });
    });
});
