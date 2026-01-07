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
const isArabicDiacriticCode = (code: number) => code >= 0x064b && code <= 0x0652;

const equivKey = (ch: string) => {
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

export const matchFuzzyLiteralPrefixAt = (content: string, offset: number, literal: string) => {
    let i = offset;
    while (i < content.length && isArabicDiacriticCode(content.charCodeAt(i))) {
        i++;
    }

    for (let j = 0; j < literal.length; j++) {
        const litCh = literal[j];
        while (i < content.length && isArabicDiacriticCode(content.charCodeAt(i))) {
            i++;
        }
        if (i >= content.length || equivKey(content[i]) !== equivKey(litCh)) {
            return null;
        }
        i++;
    }

    while (i < content.length && isArabicDiacriticCode(content.charCodeAt(i))) {
        i++;
    }
    return i;
};

const isLiteralOnly = (s: string) => !/[\\[\]{}()^$.*+?]/.test(s);

export const compileLiteralAlternation = (pattern: string) => {
    if (!pattern || !isLiteralOnly(pattern)) {
        return null;
    }
    const alternatives = pattern
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean);
    return alternatives.length ? { alternatives } : null;
};

export const compileFastFuzzyTokenRule = (tokenTemplate: string) => {
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
    return compiled ? { alternatives: compiled.alternatives, token } : null;
};

export const matchFastFuzzyTokenAt = (content: string, offset: number, compiled: FastFuzzyTokenRule) => {
    for (const alt of compiled.alternatives) {
        const end = matchFuzzyLiteralPrefixAt(content, offset, alt);
        if (end !== null) {
            return end;
        }
    }
    return null;
};
