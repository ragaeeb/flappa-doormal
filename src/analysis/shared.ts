// Shared utilities for analysis functions

import { getAvailableTokens, TOKEN_PATTERNS } from '../segmentation/tokens.js';

// ─────────────────────────────────────────────────────────────
// Helpers shared across analysis modules
// ─────────────────────────────────────────────────────────────

// For analysis signatures we avoid escaping ()[] because:
// - These are commonly used literally in texts (e.g., "(ح)")
// - When signatures are later used in template patterns, ()[] are auto-escaped there
// We still escape other regex metacharacters to keep signatures safe if reused as templates.
export const escapeSignatureLiteral = (s: string): string => s.replace(/[.*+?^${}|\\{}]/g, '\\$&');

// Keep this intentionally focused on "useful at line start" tokens, avoiding overly-generic tokens like {{harf}}.
export const TOKEN_PRIORITY_ORDER: string[] = [
    'basmalah',
    'kitab',
    'bab',
    'fasl',
    'naql',
    'rumuz',
    'numbered',
    'raqms',
    'raqm',
    'dash',
    'bullet',
    'tarqim',
];

export const buildTokenPriority = (): string[] => {
    const allTokens = new Set(getAvailableTokens());
    // IMPORTANT: We only use an explicit allow-list here.
    // Including "all remaining tokens" adds overly-generic tokens (e.g., harf) which makes signatures noisy.
    return TOKEN_PRIORITY_ORDER.filter((t) => allTokens.has(t));
};

export const collapseWhitespace = (s: string): string => s.replace(/\s+/g, ' ').trim();

// Arabic diacritics / tashkeel marks that commonly appear in Shamela texts.
// This is intentionally conservative: remove combining marks but keep letters.
export const stripArabicDiacritics = (s: string): string =>
    // harakat + common Quranic marks + tatweel
    s.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/gu, '');

export type CompiledTokenRegex = { token: string; re: RegExp };

export const compileTokenRegexes = (tokenNames: string[]): CompiledTokenRegex[] => {
    const compiled: CompiledTokenRegex[] = [];
    for (const token of tokenNames) {
        const pat = TOKEN_PATTERNS[token];
        if (!pat) {
            continue;
        }
        try {
            compiled.push({ re: new RegExp(pat, 'uy'), token });
        } catch {
            // Ignore invalid patterns
        }
    }
    return compiled;
};

export const appendWs = (out: string, mode: 'regex' | 'space'): string => {
    if (!out) {
        return out;
    }
    if (mode === 'space') {
        return out.endsWith(' ') ? out : `${out} `;
    }
    return out.endsWith('\\s*') ? out : `${out}\\s*`;
};

export const findBestTokenMatchAt = (
    s: string,
    pos: number,
    compiled: CompiledTokenRegex[],
    isArabicLetter: (ch: string) => boolean,
): { token: string; text: string } | null => {
    let best: { token: string; text: string } | null = null;
    for (const { token, re } of compiled) {
        re.lastIndex = pos;
        const m = re.exec(s);
        if (!m || m.index !== pos) {
            continue;
        }
        if (!best || m[0].length > best.text.length) {
            best = { text: m[0], token };
        }
    }

    if (best?.token === 'rumuz') {
        const end = pos + best.text.length;
        const next = end < s.length ? s[end] : '';
        if (next && isArabicLetter(next) && !/\s/u.test(next)) {
            return null;
        }
    }

    return best;
};

// IMPORTANT: do NOT treat all Arabic-block codepoints as "letters" (it includes punctuation like "،").
// We only want to consider actual letters here for the rumuz boundary guard.
export const isArabicLetter = (ch: string): boolean => /\p{Script=Arabic}/u.test(ch) && /\p{L}/u.test(ch);
export const isCommonDelimiter = (ch: string): boolean => /[:：\-–—ـ،؛.?!؟()[\]{}]/u.test(ch);
