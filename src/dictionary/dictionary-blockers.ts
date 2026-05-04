/**
 * Blocker evaluation for the dictionary runtime.
 *
 * Each `rejectsVia*` function encapsulates a single blocker type.
 * `getCandidateRejection` is the orchestrating entry point used by both
 * `collectDictionarySplitPoints` and `diagnoseDictionaryProfile`, including
 * the non-configurable safety rejections reported via `rejectionReasons`.
 */

import type {
    DictionaryDiagnosticReason,
    NormalizedDictionaryBlocker,
    NormalizedDictionaryZone,
} from '@/types/dictionary.js';
import { normalizeArabicForComparison } from '../utils/textUtils.js';
import {
    ARABIC_WORD_REGEX,
    BARE_CODE_LEMMA_RE,
    HEADING_PREFIX,
    INTRO_TAIL_PATTERNS,
    NORMALIZED_AUTHORITY_AGGRESSIVE_TERMS,
    NORMALIZED_AUTHORITY_HEAD_WORDS_SET,
    NORMALIZED_AUTHORITY_RE,
    NORMALIZED_CONTINUATION_PREV_WORDS_SET,
    NORMALIZED_INTRO_PHRASES,
    NORMALIZED_INTRO_TAIL_PHRASES,
    NORMALIZED_QUALIFIER_TAIL_PREFIXES,
    NORMALIZED_STRUCTURAL_LEMMA_PREFIXES,
    NORMALIZED_STRUCTURAL_LINE_KEYWORDS,
    NORMALIZED_WLAL_PREFIX,
    normalizeStopLemmaWord,
    STRONG_SENTENCE_TERMINATORS,
    STRUCTURAL_LINE_PATTERNS,
    TRAILING_PAGE_WRAP_NOISE,
    TRAILING_WORD_DELIMITERS,
} from './constants.js';
import type { DictionaryCandidate, DictionaryFamilyUse } from './dictionary-candidates.js';
import type { PageContext } from './dictionary-zones.js';

export type RejectionResult = {
    reason: DictionaryDiagnosticReason;
};

/**
 * Limit backwards scans to a small suffix; dictionary blockers only need the
 * immediate local context rather than an unbounded full-page search.
 */
const LAST_ARABIC_WORD_LOOKBACK_CHARS = 256;
const MAX_INTRO_CONTEXT_CHARS = 240;
const IGNORABLE_BOUNDARY_CHAR_RE = /(?:\s|\u200B|\u200C|\u200D|\u200E|\u200F|\u061C)/u;

const trimTrailingPageWrapNoise = (text: string) => text.trimEnd().replace(TRAILING_PAGE_WRAP_NOISE, '');

export const endsWithStrongSentenceTerminator = (pageContent: string) =>
    STRONG_SENTENCE_TERMINATORS.test(trimTrailingPageWrapNoise(pageContent));

const extractLastArabicWord = (text: string, endExclusive = text.length) => {
    const windowStart = Math.max(0, endExclusive - LAST_ARABIC_WORD_LOOKBACK_CHARS);
    const window = text.slice(windowStart, endExclusive);
    const withoutTrailingDelimiters = trimTrailingPageWrapNoise(window).replace(TRAILING_WORD_DELIMITERS, '');
    let lastMatch = '';
    ARABIC_WORD_REGEX.lastIndex = 0;
    for (const match of withoutTrailingDelimiters.matchAll(ARABIC_WORD_REGEX)) {
        lastMatch = match[0];
    }
    return lastMatch;
};

const previousNonWhitespaceChar = (text: string, endExclusive = text.length): string => {
    for (let index = endExclusive - 1; index >= 0; index--) {
        const char = text[index];
        if (char && !IGNORABLE_BOUNDARY_CHAR_RE.test(char)) {
            return char;
        }
    }
    return '';
};

const isAtPageStart = (text: string, endExclusive: number): boolean => {
    for (let index = endExclusive - 1; index >= 0; index--) {
        const char = text[index];
        if (char && !IGNORABLE_BOUNDARY_CHAR_RE.test(char)) {
            return false;
        }
    }
    return true;
};

export const normalizeStopLemma = normalizeStopLemmaWord;

const getTrailingContext = (text: string, endExclusive: number, maxChars = MAX_INTRO_CONTEXT_CHARS) =>
    text.slice(Math.max(0, endExclusive - maxChars), endExclusive);

const normalizeIntroContextText = (text: string): string =>
    normalizeArabicForComparison(text)
        .replace(/[/\\]+/gu, ' ')
        .replace(/[«»""'''()[\]{}]+/gu, ' ')
        .replace(/\s+/gu, ' ')
        .trim();

const normalizeForIntroTailCheck = (text: string): string =>
    normalizeIntroContextText(text)
        .replace(/[:؛،,.!?؟]+$/u, '')
        .trimEnd();

const isIntroCandidate = (text: string) => {
    const normalized = normalizeIntroContextText(text);
    return NORMALIZED_INTRO_PHRASES.some((phrase) => normalized.startsWith(phrase));
};

const endsWithIntroContext = (text: string) => {
    const trimmed = text.trimEnd();
    if (STRONG_SENTENCE_TERMINATORS.test(trimmed)) {
        return false;
    }
    const normalized = normalizeForIntroTailCheck(trimmed);
    if (!normalized) {
        return false;
    }

    if (NORMALIZED_INTRO_PHRASES.some((phrase) => normalized.endsWith(phrase))) {
        return true;
    }

    if (NORMALIZED_INTRO_TAIL_PHRASES.some((phrase) => normalized.endsWith(phrase))) {
        return true;
    }

    return INTRO_TAIL_PATTERNS.some((pattern) => pattern.test(normalized));
};

const isAuthorityCandidate = (text: string, precision: 'high' | 'aggressive') => {
    const head = normalizeStopLemma(text.split(':', 1)[0] ?? text);
    if (head && NORMALIZED_AUTHORITY_HEAD_WORDS_SET.has(head)) {
        return true;
    }

    const normalized = normalizeIntroContextText(text);
    if (NORMALIZED_AUTHORITY_RE.test(normalized)) {
        return true;
    }

    if (precision === 'aggressive') {
        return NORMALIZED_AUTHORITY_AGGRESSIVE_TERMS.some((term) => normalized.startsWith(term));
    }

    return false;
};

const hasBlockedQualifierTail = (lemma: string): boolean => {
    const parts = lemma
        .split(/[،,]/u)
        .map((part) => part.trim())
        .filter(Boolean);
    if (parts.length < 2) {
        return false;
    }

    const tail = normalizeArabicForComparison(parts.slice(1).join(' '));
    return NORMALIZED_QUALIFIER_TAIL_PREFIXES.some((prefix) => tail.startsWith(prefix));
};

const looksLikeStructuralLeak = (candidate: DictionaryCandidate): boolean => {
    if (!candidate.lemma) {
        return false;
    }

    const normalizedLemma = normalizeArabicForComparison(candidate.lemma);

    if (
        candidate.kind === 'entry' &&
        (/^[^\p{Script=Arabic}\d]+/u.test(candidate.lemma) ||
            candidate.lemma.includes('{') ||
            candidate.lemma.includes('}') ||
            candidate.lemma.includes('##'))
    ) {
        return true;
    }

    if (
        candidate.kind === 'entry' &&
        BARE_CODE_LEMMA_RE.test(candidate.lemma) &&
        (candidate.text === candidate.lemma ||
            candidate.text === `${HEADING_PREFIX}${candidate.lemma}` ||
            candidate.text.startsWith(`${HEADING_PREFIX}${candidate.lemma}`) ||
            candidate.text.startsWith(`${candidate.lemma}\n${HEADING_PREFIX}`))
    ) {
        return true;
    }

    if (candidate.family !== 'pairedForms' && candidate.lemma.split(/\s+/u).filter(Boolean).length > 4) {
        return true;
    }

    if (NORMALIZED_STRUCTURAL_LEMMA_PREFIXES.some((prefix) => normalizedLemma.startsWith(prefix))) {
        return true;
    }

    if (normalizedLemma.startsWith(NORMALIZED_WLAL_PREFIX)) {
        return true;
    }

    const structuralText = candidate.text.startsWith(HEADING_PREFIX)
        ? candidate.text.slice(HEADING_PREFIX.length).trim()
        : candidate.text;
    if (/^[\d\u0660-\u0669]+\s*-\s*\([^)]+\)(?:\s+##.*)?$/u.test(structuralText)) {
        return true;
    }

    const normalizedText = normalizeArabicForComparison(structuralText);
    if (STRUCTURAL_LINE_PATTERNS.some((pattern) => pattern.test(structuralText))) {
        return NORMALIZED_STRUCTURAL_LINE_KEYWORDS.some((keyword) => normalizedText.includes(keyword));
    }

    return false;
};

const blockerApplies = (blocker: NormalizedDictionaryBlocker, family: DictionaryFamilyUse) =>
    !blocker.appliesTo || blocker.appliesTo.includes(family);

const rejectsViaIntroBlocker = (
    candidate: DictionaryCandidate,
    blocker: NormalizedDictionaryBlocker,
    localBeforeCandidate: string,
) => {
    if (blocker.use !== 'intro') {
        return false;
    }

    return isIntroCandidate(candidate.probeText) || endsWithIntroContext(localBeforeCandidate);
};

const rejectsViaAuthorityBlocker = (candidate: DictionaryCandidate, blocker: NormalizedDictionaryBlocker) =>
    blocker.use === 'authorityIntro' && isAuthorityCandidate(candidate.probeText, blocker.precision);

const rejectsViaStopLemmaBlocker = (candidate: DictionaryCandidate, blocker: NormalizedDictionaryBlocker) => {
    if (blocker.use !== 'stopLemma' || !candidate.lemma) {
        return false;
    }

    const normalizedLemma = normalizeStopLemma(candidate.lemma);
    return !!normalizedLemma && blocker.normalizedWords.has(normalizedLemma);
};

const previousWordIsBlocked = (blocker: Extract<NormalizedDictionaryBlocker, { use: 'previousWord' }>, word: string) =>
    !!word && blocker.normalizedWords.has(normalizeArabicForComparison(word));

const rejectsViaPageStartPreviousWord = (
    blocker: Extract<NormalizedDictionaryBlocker, { use: 'previousWord' }>,
    pageIndex: number,
    pages: PageContext[],
) => {
    if (pageIndex === 0) {
        return false;
    }

    const previousPage = pages[pageIndex - 1];
    if (!previousPage || endsWithStrongSentenceTerminator(previousPage.content)) {
        return false;
    }

    return previousWordIsBlocked(blocker, extractLastArabicWord(previousPage.content));
};

const rejectsViaPreviousWordBlocker = (
    pageContent: string,
    localIndex: number,
    blocker: NormalizedDictionaryBlocker,
    pageIndex: number,
    pages: PageContext[],
) => {
    if (blocker.use !== 'previousWord') {
        return false;
    }

    if (isAtPageStart(pageContent, localIndex)) {
        if (blocker.scope === 'pageStart') {
            return rejectsViaPageStartPreviousWord(blocker, pageIndex, pages);
        }
        if (blocker.scope === 'any' && rejectsViaPageStartPreviousWord(blocker, pageIndex, pages)) {
            return true;
        }
    }

    if (blocker.scope === 'pageStart') {
        return false;
    }

    return previousWordIsBlocked(blocker, extractLastArabicWord(pageContent, localIndex));
};

const rejectsViaPreviousCharBlocker = (
    pageContent: string,
    localIndex: number,
    blocker: NormalizedDictionaryBlocker,
) => {
    if (blocker.use !== 'previousChar') {
        return false;
    }

    const previousChar = previousNonWhitespaceChar(pageContent, localIndex);
    return !!previousChar && blocker.charSet.has(previousChar);
};

const rejectsViaPageContinuationBlocker = (
    candidate: DictionaryCandidate,
    blocker: NormalizedDictionaryBlocker,
    pageContent: string,
    pageIndex: number,
    pages: PageContext[],
) => {
    if (blocker.use !== 'pageContinuation') {
        return false;
    }

    const isPageStartCandidate = isAtPageStart(pageContent, candidate.localIndex);
    if (!isPageStartCandidate || pageIndex === 0) {
        return false;
    }

    const previousPage = pages[pageIndex - 1];
    if (!previousPage || endsWithStrongSentenceTerminator(previousPage.content)) {
        return false;
    }

    const previousWord = extractLastArabicWord(previousPage.content);
    const previousWordBlocks =
        !!previousWord && NORMALIZED_CONTINUATION_PREV_WORDS_SET.has(normalizeArabicForComparison(previousWord));

    return (
        previousWordBlocks ||
        endsWithIntroContext(previousPage.content) ||
        isIntroCandidate(candidate.probeText) ||
        isAuthorityCandidate(candidate.probeText, blocker.authorityPrecision)
    );
};

const getBlockerRejectionReason = (
    blocker: NormalizedDictionaryBlocker,
    candidate: DictionaryCandidate,
    localBeforeCandidate: string,
    pageContent: string,
    pageIndex: number,
    pages: PageContext[],
): DictionaryDiagnosticReason | null => {
    if (rejectsViaIntroBlocker(candidate, blocker, localBeforeCandidate)) {
        return 'intro';
    }
    if (rejectsViaAuthorityBlocker(candidate, blocker)) {
        return 'authorityIntro';
    }
    if (rejectsViaStopLemmaBlocker(candidate, blocker)) {
        return 'stopLemma';
    }
    if (rejectsViaPreviousWordBlocker(pageContent, candidate.localIndex, blocker, pageIndex, pages)) {
        return 'previousWord';
    }
    if (rejectsViaPreviousCharBlocker(pageContent, candidate.localIndex, blocker)) {
        return 'previousChar';
    }
    if (rejectsViaPageContinuationBlocker(candidate, blocker, pageContent, pageIndex, pages)) {
        return 'pageContinuation';
    }
    return null;
};

/**
 * Evaluates candidate rejection in two phases:
 *
 * Phase 1: global safety checks (not configurable per profile)
 * - `qualifierTail`: rejects comma-tail qualifier fragments such as "أي" and "قال"
 * - `structuralLeak`: rejects markdown artifacts, structural headings, and other non-lexeme leaks
 *
 * These are hard safety invariants for the Shamela-style dictionary surface,
 * so diagnostics report them alongside configurable blocker reasons.
 *
 * Phase 2: zone blockers (configurable per zone)
 * - iterates `zone.blockers` in declaration order
 * - returns the first matching rejection reason
 */
export const getCandidateRejection = (
    candidate: DictionaryCandidate,
    zone: NormalizedDictionaryZone,
    pageContext: PageContext,
    pages: PageContext[],
): RejectionResult | null => {
    const hasQualifierTail = hasBlockedQualifierTail(candidate.lemma ?? '');
    if (hasQualifierTail || looksLikeStructuralLeak(candidate)) {
        return { reason: hasQualifierTail ? 'qualifierTail' : 'structuralLeak' };
    }

    const localBeforeCandidate = getTrailingContext(pageContext.content, candidate.localIndex);

    for (const blocker of zone.blockers) {
        if (!blockerApplies(blocker, candidate.family)) {
            continue;
        }
        const reason = getBlockerRejectionReason(
            blocker,
            candidate,
            localBeforeCandidate,
            pageContext.content,
            pageContext.index,
            pages,
        );
        if (reason) {
            return { reason };
        }
    }

    return null;
};

/**
 * Returns `true` when the candidate should be dropped (i.e. any rejection
 * reason exists).  Convenience wrapper over `getCandidateRejection`.
 */
export const shouldRejectCandidate = (
    candidate: DictionaryCandidate,
    zone: NormalizedDictionaryZone,
    pageContext: PageContext,
    pages: PageContext[],
): boolean => getCandidateRejection(candidate, zone, pageContext, pages) !== null;
