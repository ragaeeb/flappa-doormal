import { describe, expect, it } from 'bun:test';

import { validateRules } from './pattern-validator.js';

describe('validateRules', () => {
    describe('missing braces detection', () => {
        it('should detect bare token name without braces in lineStartsAfter', () => {
            const result = validateRules([{ lineStartsAfter: ['raqms:num'], split: 'at' }]);
            expect(result).toHaveLength(1);
            expect(result[0]?.lineStartsAfter?.[0]?.type).toBe('missing_braces');
            expect(result[0]?.lineStartsAfter?.[0]?.message).toContain('raqms');
        });

        it('should detect (rumuz:rumuz) typo without {{}}', () => {
            const result = validateRules([{ lineStartsAfter: ['## (rumuz:rumuz)'], split: 'at' }]);
            expect(result).toHaveLength(1);
            expect(result[0]?.lineStartsAfter?.[0]?.type).toBe('missing_braces');
            expect(result[0]?.lineStartsAfter?.[0]?.message).toContain('rumuz');
        });

        it('should detect bare token name without capture syntax', () => {
            const result = validateRules([{ lineStartsWith: ['bab الصلاة'], split: 'at' }]);
            expect(result).toHaveLength(1);
            expect(result[0]?.lineStartsWith?.[0]?.type).toBe('missing_braces');
            expect(result[0]?.lineStartsWith?.[0]?.message).toContain('bab');
        });

        it('should return undefined for valid patterns', () => {
            const result = validateRules([{ lineStartsAfter: ['{{raqms:num}} {{dash}}'], split: 'at' }]);
            expect(result).toHaveLength(1);
            expect(result[0]).toBeUndefined();
        });
    });

    describe('unknown token detection', () => {
        it('should detect unknown token names inside {{}}', () => {
            const result = validateRules([{ lineStartsWith: ['{{nonexistent}}'], split: 'at' }]);
            expect(result).toHaveLength(1);
            expect(result[0]?.lineStartsWith?.[0]?.type).toBe('unknown_token');
            expect(result[0]?.lineStartsWith?.[0]?.message).toContain('nonexistent');
        });

        it('should detect unknown token with capture syntax', () => {
            const result = validateRules([{ lineStartsWith: ['{{unknown:name}}'], split: 'at' }]);
            expect(result).toHaveLength(1);
            expect(result[0]?.lineStartsWith?.[0]?.type).toBe('unknown_token');
        });

        it('should not flag known tokens', () => {
            const result = validateRules([
                { lineStartsWith: ['{{bab}}', '{{kitab}}', '{{naql}}', '{{rumuz}}'], split: 'at' },
            ]);
            expect(result).toHaveLength(1);
            expect(result[0]).toBeUndefined();
        });
    });

    describe('duplicate pattern detection', () => {
        it('should detect duplicate patterns in the same rule', () => {
            const result = validateRules([{ lineStartsWith: ['{{raqms}}', '{{dash}}', '{{raqms}}'], split: 'at' }]);
            expect(result).toHaveLength(1);
            // First occurrence is fine, second is a duplicate
            expect(result[0]?.lineStartsWith?.[0]).toBeUndefined();
            expect(result[0]?.lineStartsWith?.[1]).toBeUndefined();
            expect(result[0]?.lineStartsWith?.[2]?.type).toBe('duplicate');
        });
    });

    describe('multiple rules', () => {
        it('should validate each rule independently', () => {
            const result = validateRules([
                { lineStartsAfter: ['{{raqms}}'], split: 'at' }, // valid
                { lineStartsWith: ['rumuz:name'], split: 'at' }, // missing braces
                { lineEndsWith: ['{{unknown}}'], split: 'at' }, // unknown token
            ]);
            expect(result).toHaveLength(3);
            expect(result[0]).toBeUndefined();
            expect(result[1]?.lineStartsWith?.[0]?.type).toBe('missing_braces');
            expect(result[2]?.lineEndsWith?.[0]?.type).toBe('unknown_token');
        });
    });

    describe('template and regex patterns', () => {
        it('should validate template patterns', () => {
            const result = validateRules([{ split: 'at', template: 'raqms {{dash}}' }]);
            expect(result).toHaveLength(1);
            expect(result[0]?.template?.type).toBe('missing_braces');
        });

        it('should reject empty template patterns', () => {
            const result = validateRules([{ split: 'at', template: '' } as never]);
            expect(result).toHaveLength(1);
            expect(result[0]?.template?.type).toBe('empty_pattern');
        });

        it('should reject whitespace-only template patterns', () => {
            const result = validateRules([{ split: 'at', template: '   ' } as never]);
            expect(result).toHaveLength(1);
            expect(result[0]?.template?.type).toBe('empty_pattern');
        });

        it('should not validate regex patterns (raw regex)', () => {
            // regex patterns are raw, not templates - we skip them
            const result = validateRules([{ regex: 'raqms \\d+', split: 'at' }]);
            expect(result).toHaveLength(1);
            expect(result[0]).toBeUndefined();
        });
    });

    describe('empty patterns', () => {
        it('should reject empty lineStartsWith items', () => {
            const result = validateRules([{ lineStartsWith: [''], split: 'at' }]);
            expect(result).toHaveLength(1);
            expect(result[0]?.lineStartsWith?.[0]?.type).toBe('empty_pattern');
        });

        it('should reject whitespace-only lineStartsAfter items', () => {
            const result = validateRules([{ lineStartsAfter: ['   '], split: 'at' }]);
            expect(result).toHaveLength(1);
            expect(result[0]?.lineStartsAfter?.[0]?.type).toBe('empty_pattern');
        });

        it('should reject empty lineEndsWith items', () => {
            const result = validateRules([{ lineEndsWith: [''], split: 'after' }]);
            expect(result).toHaveLength(1);
            expect(result[0]?.lineEndsWith?.[0]?.type).toBe('empty_pattern');
        });
    });

    describe('edge cases', () => {
        it('should handle empty rules array', () => {
            const result = validateRules([]);
            expect(result).toEqual([]);
        });

        it('should handle rules with no patterns', () => {
            const result = validateRules([{ split: 'at' } as never]);
            expect(result).toHaveLength(1);
            expect(result[0]).toBeUndefined();
        });

        it('should not flag tokens correctly wrapped with named captures', () => {
            const result = validateRules([
                { lineStartsAfter: ['{{raqms:num}} {{dash}} {{rumuz:codes}}'], split: 'at' },
            ]);
            expect(result).toHaveLength(1);
            expect(result[0]).toBeUndefined();
        });
    });

    describe('structured issue data', () => {
        it('should include token in missing_braces issue', () => {
            const result = validateRules([{ lineStartsWith: ['raqms'], split: 'at' }]);
            const issue = result[0]?.lineStartsWith?.[0];
            expect(issue?.type).toBe('missing_braces');
            expect(issue?.token).toBe('raqms');
        });

        it('should include token in unknown_token issue', () => {
            const result = validateRules([{ lineStartsWith: ['{{badtoken}}'], split: 'at' }]);
            const issue = result[0]?.lineStartsWith?.[0];
            expect(issue?.type).toBe('unknown_token');
            expect(issue?.token).toBe('badtoken');
        });

        it('should include pattern in duplicate issue', () => {
            const result = validateRules([{ lineStartsWith: ['a', 'a'], split: 'at' }]);
            const issue = result[0]?.lineStartsWith?.[1];
            expect(issue?.type).toBe('duplicate');
            expect(issue?.pattern).toBe('a');
        });
    });
});

import { formatValidationReport } from './pattern-validator.js';

describe('formatValidationReport', () => {
    it('formats missing braces errors', () => {
        const issues = validateRules([{ lineStartsWith: ['raqms'], split: 'at' }]);
        const report = formatValidationReport(issues);
        expect(report).toHaveLength(1);
        expect(report[0]).toBe('Rule 1, lineStartsWith: Missing {{}} around token "raqms"');
    });

    it('formats unknown token errors', () => {
        const issues = validateRules([{ lineStartsAfter: ['{{bad}}'], split: 'at' }]);
        const report = formatValidationReport(issues);
        expect(report).toHaveLength(1);
        expect(report[0]).toBe('Rule 1, lineStartsAfter: Unknown token "{{bad}}"');
    });

    it('formats duplicate pattern errors', () => {
        const issues = validateRules([{ lineStartsWith: ['foo', 'foo'], split: 'at', template: 'foo' }]);
        const report = formatValidationReport(issues);
        expect(report).toHaveLength(1);
        expect(report[0]).toBe('Rule 1, lineStartsWith: Duplicate pattern "foo"');
    });

    it('formats multiple errors across rules', () => {
        const issues = validateRules([
            { lineStartsWith: ['raqms'], split: 'at' },
            { lineStartsWith: ['{{bad}}'], split: 'at' },
        ]);
        const report = formatValidationReport(issues);
        expect(report).toHaveLength(2);
        expect(report[0]).toContain('Rule 1');
        expect(report[1]).toContain('Rule 2');
    });

    it('handles empty/undefined inputs safely', () => {
        expect(formatValidationReport([])).toEqual([]);
        expect(formatValidationReport([undefined, undefined])).toEqual([]);
    });
});
