import { describe, expect, it } from 'bun:test';
import {
    buildBreakpointDebugPatch,
    buildContentLengthDebugPatch,
    buildRuleDebugPatch,
    getDebugReason,
    getSegmentDebugReason,
    mergeDebugIntoMeta,
    resolveDebugConfig,
} from './debug-meta.js';

describe('debug-meta', () => {
    // resolveDebugConfig
    describe('resolveDebugConfig', () => {
        it('should return default config when true', () => {
            expect(resolveDebugConfig(true)).toEqual({
                includeBreakpoint: true,
                includeRule: true,
                metaKey: '_flappa',
            });
        });

        it('should return null when false or undefined', () => {
            expect(resolveDebugConfig(false)).toBeNull();
            expect(resolveDebugConfig(undefined)).toBeNull();
            expect(resolveDebugConfig(null)).toBeNull();
        });

        it('should parse object config', () => {
            expect(resolveDebugConfig({ include: ['rule'], metaKey: '_custom' })).toEqual({
                includeBreakpoint: false,
                includeRule: true,
                metaKey: '_custom',
            });
            // default include is true if array not provided
            expect(resolveDebugConfig({ metaKey: '_custom' })).toEqual({
                includeBreakpoint: true,
                includeRule: true,
                metaKey: '_custom',
            });
        });
    });

    // mergeDebugIntoMeta
    describe('mergeDebugIntoMeta', () => {
        it('should create new meta object if undefined', () => {
            const result = mergeDebugIntoMeta(undefined, '_flappa', { foo: 'bar' });
            expect(result).toEqual({ _flappa: { foo: 'bar' } });
        });

        it('should merge into existing meta', () => {
            const meta = { existing: 1 };
            const result = mergeDebugIntoMeta(meta, '_flappa', { foo: 'bar' });
            expect(result).toEqual({ _flappa: { foo: 'bar' }, existing: 1 });
        });

        it('should merge patches into existing debug key', () => {
            const meta = { _flappa: { old: 1 } };
            const result = mergeDebugIntoMeta(meta, '_flappa', { new: 2 });
            expect(result).toEqual({ _flappa: { new: 2, old: 1 } });
        });
    });

    // build patches
    describe('patch builders', () => {
        it('buildRuleDebugPatch', () => {
            const rule = { lineStartsWith: ['A'] };
            const patch = buildRuleDebugPatch(0, rule, 0);
            expect(patch).toEqual({
                rule: {
                    index: 0,
                    patternType: 'lineStartsWith',
                    word: 'A',
                    wordIndex: 0,
                },
            });
        });

        it('buildRuleDebugPatch without word', () => {
            const rule = { regex: 'A' };
            const patch = buildRuleDebugPatch(0, rule);
            expect(patch).toEqual({
                rule: {
                    index: 0,
                    patternType: 'regex',
                },
            });
        });

        it('buildBreakpointDebugPatch', () => {
            const rule = { pattern: 'B' };
            const patch = buildBreakpointDebugPatch(1, rule);
            expect(patch).toEqual({
                breakpoint: {
                    index: 1,
                    kind: 'pattern',
                    pattern: 'B',
                },
            });
        });

        it('buildContentLengthDebugPatch', () => {
            const patch = buildContentLengthDebugPatch(100, 150, 'whitespace');
            expect(patch).toEqual({
                contentLengthSplit: {
                    actualLength: 150,
                    maxContentLength: 100,
                    splitReason: 'whitespace',
                },
            });
        });
    });

    // getDebugReason
    describe('getDebugReason', () => {
        it('should return "-" if no debug info', () => {
            expect(getDebugReason(undefined)).toBe('-');
            expect(getDebugReason({})).toBe('-');
        });

        it('should format rule reason', () => {
            const meta = { _flappa: { rule: { index: 0, patternType: 'lineStartsWith', word: 'foo', wordIndex: 1 } } };
            expect(getDebugReason(meta)).toBe('Rule #0 (lineStartsWith) [idx:1] (Matched: "foo")');
        });

        it('should format rule reason (concise)', () => {
            const meta = { _flappa: { rule: { index: 0, patternType: 'lineStartsWith', word: 'foo', wordIndex: 1 } } };
            expect(getDebugReason(meta, { concise: true })).toBe('Rule: "foo"');
        });

        it('should format rule reason (concise, no word)', () => {
            // Example: regex rule
            const meta = { _flappa: { rule: { index: 0, patternType: 'regex' } } };
            expect(getDebugReason(meta, { concise: true })).toBe('Rule: regex');
        });

        it('should format breakpoint reason', () => {
            const meta = { _flappa: { breakpoint: { index: 1, kind: 'pattern', pattern: '\\.' } } };
            expect(getDebugReason(meta)).toBe('Breakpoint #1 (pattern) - "\\."');
        });

        it('should format breakpoint reason (concise)', () => {
            const meta = { _flappa: { breakpoint: { index: 1, kind: 'pattern', pattern: '\\.' } } };
            expect(getDebugReason(meta, { concise: true })).toBe('Breakpoint: "\\."');
        });

        it('should format breakpoint words reason', () => {
            const meta = { _flappa: { breakpoint: { index: 1, kind: 'pattern', word: 'foo', wordIndex: 0 } } };
            expect(getDebugReason(meta)).toBe('Breakpoint #1 (Words) [idx:0] - "foo"');
        });

        it('should format breakpoint words reason (concise)', () => {
            const meta = { _flappa: { breakpoint: { index: 1, kind: 'pattern', word: 'foo', wordIndex: 0 } } };
            expect(getDebugReason(meta, { concise: true })).toBe('Breakpoint: "foo"');
        });

        it('should format page boundary fallback', () => {
            const meta = { _flappa: { breakpoint: { index: 2, kind: 'pageBoundary' } } };
            expect(getDebugReason(meta)).toBe('Page Boundary (Fallback)');
        });

        it('should format page boundary fallback (concise)', () => {
            const meta = { _flappa: { breakpoint: { index: 2, kind: 'pageBoundary' } } };
            expect(getDebugReason(meta, { concise: true })).toBe('Breakpoint: <page-boundary>');
        });

        it('should format safety split', () => {
            const meta = { _flappa: { contentLengthSplit: { maxContentLength: 1000, splitReason: 'whitespace' } } };
            expect(getDebugReason(meta)).toBe('Safety Split (whitespace) > 1000');
        });

        it('should format safety split (concise)', () => {
            const meta = { _flappa: { contentLengthSplit: { maxContentLength: 1000, splitReason: 'whitespace' } } };
            expect(getDebugReason(meta, { concise: true })).toBe('> 1000 (whitespace)');
        });

        it('should return Unknown for unknown types', () => {
            const meta = { _flappa: { other: {} } };
            expect(getDebugReason(meta)).toBe('Unknown');
        });
    });

    // getSegmentDebugReason
    describe('getSegmentDebugReason', () => {
        it('should forward to getDebugReason', () => {
            const segment = { content: 'c', from: 1, meta: { _flappa: { rule: { index: 0, patternType: 'regex' } } } };
            expect(getSegmentDebugReason(segment)).toBe('Rule #0 (regex)');
            expect(getSegmentDebugReason(segment, { concise: true })).toBe('Rule: regex');
        });
    });
});
