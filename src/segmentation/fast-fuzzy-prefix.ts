/**
 * Fast-path fuzzy prefix matching for common Arabic line-start markers.
 *
 * This exists to avoid running expensive fuzzy-expanded regex alternations over
 * a giant concatenated string. Instead, we match only at known line-start
 * offsets and perform a small deterministic comparison:
 * - Skip Arabic diacritics in the CONTENT
 * - Treat common equivalence groups as equal (ا/آ/أ/إ, ة/ه, ى/ي)
 *
 * This module is intentionally conservative: it only supports "literal"
 * token patterns (plain text alternation via `|`), not general regex.
 */

import { getTokenPattern } from './tokens.js';

// U+064B..U+0652 (tashkeel/harakat)
const isArabicDiacriticCode = (code: number): boolean => code >= 0x064b && code <= 0x0652;

// Map a char to a representative equivalence class key.
// Keep this in sync with EQUIV_GROUPS in fuzzy.ts.
const equivKey = (ch: string): string => {
    switch (ch) {
        case '\u0622': // آ
        case '\u0623': // أ
        case '\u0625': // إ
            return '\u0627'; // ا
        case '\u0647': // ه
            return '\u0629'; // ة
        case '\u064a': // ي
            return '\u0649'; // ى
        default:
            return ch;
    }
};

/**
 * Match a fuzzy literal prefix at a given offset.
 *
 * - Skips diacritics in the content
 * - Applies equivalence groups on both content and literal
 *
 * @returns endOffset (exclusive) in CONTENT if matched; otherwise null.
 */
export const matchFuzzyLiteralPrefixAt = (content: string, offset: number, literal: string): number | null => {
    let i = offset;
    // Skip leading diacritics in content (rare but possible)
    while (i < content.length && isArabicDiacriticCode(content.charCodeAt(i))) {
        i++;
    }

    for (let j = 0; j < literal.length; j++) {
        const litCh = literal[j];

        // In literal, we treat whitespace literally (no collapsing).
        // (Tokens like kitab/bab/fasl/naql/basmalah do not rely on fuzzy spaces.)
        // Skip diacritics in content before matching each char.
        while (i < content.length && isArabicDiacriticCode(content.charCodeAt(i))) {
            i++;
        }

        if (i >= content.length) {
            return null;
        }

        const cCh = content[i];
        if (equivKey(cCh) !== equivKey(litCh)) {
            return null;
        }
        i++;
    }

    // Allow trailing diacritics immediately after the matched prefix.
    while (i < content.length && isArabicDiacriticCode(content.charCodeAt(i))) {
        i++;
    }
    return i;
};

const isLiteralOnly = (s: string): boolean => {
    // Reject anything that looks like regex syntax.
    // We allow only plain text (including Arabic, spaces) and the alternation separator `|`.
    // This intentionally rejects tokens like `tarqim: '[.!?؟؛]'`, which are not literal.
    return !/[\\[\]{}()^$.*+?]/.test(s);
};

export type CompiledLiteralAlternation = {
    alternatives: string[];
};

export const compileLiteralAlternation = (pattern: string): CompiledLiteralAlternation | null => {
    if (!pattern) {
        return null;
    }
    if (!isLiteralOnly(pattern)) {
        return null;
    }
    const alternatives = pattern
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean);
    if (!alternatives.length) {
        return null;
    }
    return { alternatives };
};

export type FastFuzzyTokenRule = {
    token: string; // token name, e.g. 'kitab'
    alternatives: string[]; // resolved literal alternatives
};

/**
 * Attempt to compile a fast fuzzy rule from a single-token pattern like `{{kitab}}`.
 * Returns null if not eligible.
 */
export const compileFastFuzzyTokenRule = (tokenTemplate: string): FastFuzzyTokenRule | null => {
    const m = tokenTemplate.match(/^\{\{(\w+)\}\}$/);
    if (!m) {
        return null;
    }
    const token = m[1];
    const tokenPattern = getTokenPattern(token);
    if (!tokenPattern) {
        return null;
    }
    const compiled = compileLiteralAlternation(tokenPattern);
    if (!compiled) {
        return null;
    }
    return { alternatives: compiled.alternatives, token };
};

/**
 * Try matching any alternative for a compiled token at a line-start offset.
 * Returns endOffset (exclusive) on match, else null.
 */
export const matchFastFuzzyTokenAt = (content: string, offset: number, compiled: FastFuzzyTokenRule): number | null => {
    for (const alt of compiled.alternatives) {
        const end = matchFuzzyLiteralPrefixAt(content, offset, alt);
        if (end !== null) {
            return end;
        }
    }
    return null;
};
