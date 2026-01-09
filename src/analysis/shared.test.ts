import { describe, expect, it } from 'bun:test';
import { appendWs } from './shared.js';

describe('appendWs', () => {
    describe('space mode', () => {
        it('should append space if string does not end with space', () => {
            expect(appendWs('hello', 'space')).toBe('hello ');
        });

        it('should NOT append space if string already ends with space', () => {
            expect(appendWs('hello ', 'space')).toBe('hello ');
        });

        it('should return empty string unchanged', () => {
            expect(appendWs('', 'space')).toBe('');
        });
    });

    describe('regex mode', () => {
        it('should append \\s* if string does not end with \\s*', () => {
            expect(appendWs('hello', 'regex')).toBe('hello\\s*');
        });

        it('should NOT append \\s* if string already ends with \\s*', () => {
            // This is the critical test - should NOT duplicate the suffix
            expect(appendWs('hello\\s*', 'regex')).toBe('hello\\s*');
        });

        it('should NOT append when called multiple times (idempotency)', () => {
            // Call twice - second call should not add another \\s*
            const once = appendWs('hello', 'regex');
            const twice = appendWs(once, 'regex');
            expect(twice).toBe('hello\\s*');
        });

        it('should return empty string unchanged', () => {
            expect(appendWs('', 'regex')).toBe('');
        });
    });
});
