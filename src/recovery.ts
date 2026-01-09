import type { Page, Segment } from '@/types/index.js';
import type { SegmentationOptions } from '@/types/options.js';
import type { SplitRule } from '@/types/rules.js';
import { applyReplacements } from './preprocessing/replace.js';
import { buildRuleRegex } from './segmentation/rule-regex.js';
import { segmentPages } from './segmentation/segmenter.js';
import { normalizeLineEndings } from './utils/textUtils.js';

export type MarkerRecoverySelector =
    | { type: 'rule_indices'; indices: number[] }
    | { type: 'lineStartsAfter_patterns'; match?: 'exact' | 'normalized'; patterns: string[] }
    | { type: 'predicate'; predicate: (rule: SplitRule, index: number) => boolean };

export type MarkerRecoveryRun = {
    options: SegmentationOptions;
    pages: Page[];
    segments: Segment[];
    selector: MarkerRecoverySelector;
};

export type MarkerRecoveryReport = {
    summary: {
        mode: 'rerun_only' | 'best_effort_then_rerun';
        recovered: number;
        totalSegments: number;
        unchanged: number;
        unresolved: number;
    };
    byRun?: Array<{
        recovered: number;
        runIndex: number;
        totalSegments: number;
        unresolved: number;
    }>;
    details: Array<{
        from: number;
        originalStartPreview: string;
        recoveredPrefixPreview?: string;
        recoveredStartPreview?: string;
        segmentIndex: number;
        status: 'recovered' | 'skipped_idempotent' | 'unchanged' | 'unresolved_alignment' | 'unresolved_selector';
        strategy: 'rerun' | 'stage1' | 'none';
        to?: number;
        notes?: string[];
    }>;
    errors: string[];
    warnings: string[];
};

type NormalizeCompareMode = 'none' | 'whitespace' | 'whitespace_and_nfkc';

const preview = (s: string, max = 40): string => (s.length <= max ? s : `${s.slice(0, max)}…`);

const normalizeForCompare = (s: string, mode: NormalizeCompareMode): string => {
    if (mode === 'none') {
        return s;
    }
    let out = s;
    if (mode === 'whitespace_and_nfkc') {
        // Use alternation (not a character class) to satisfy Biome's noMisleadingCharacterClass rule.
        out = out.normalize('NFKC').replace(/(?:\u200C|\u200D|\uFEFF)/gu, '');
    }
    // Collapse whitespace and normalize line endings
    out = out.replace(/\r\n?/gu, '\n').replace(/\s+/gu, ' ').trim();
    return out;
};

const segmentRangeKey = (s: Pick<Segment, 'from' | 'to'>): string => `${s.from}|${s.to ?? s.from}`;

const buildFixedOptions = (options: SegmentationOptions, selectedRuleIndices: Set<number>): SegmentationOptions => {
    const rules = options.rules ?? [];
    const fixedRules: SplitRule[] = rules.map((r, idx) => {
        if (!selectedRuleIndices.has(idx)) {
            return r;
        }
        if (!('lineStartsAfter' in r) || !r.lineStartsAfter) {
            return r;
        }

        // Convert: lineStartsAfter -> lineStartsWith, keep all other fields.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { lineStartsAfter, ...rest } = r as SplitRule & { lineStartsAfter: string[] };
        return { ...(rest as Omit<SplitRule, 'lineStartsAfter'>), lineStartsWith: lineStartsAfter };
    });

    return { ...options, rules: fixedRules };
};

const buildPageIdToIndex = (pages: Page[]): Map<number, number> => new Map(pages.map((p, i) => [p.id, i]));

type RangeContent = {
    matchContent: string;
    outputContent: string;
};

const buildRangeContent = (
    processedPages: Page[],
    fromIdx: number,
    toIdx: number,
    pageJoiner: 'space' | 'newline',
): RangeContent => {
    const parts: string[] = [];
    for (let i = fromIdx; i <= toIdx; i++) {
        parts.push(normalizeLineEndings(processedPages[i].content));
    }
    const matchContent = parts.join('\n');
    if (pageJoiner === 'newline') {
        return { matchContent, outputContent: matchContent };
    }
    // Only convert the inserted page-boundary separators (exactly those join '\n's) to spaces.
    // In-page newlines remain as-is.
    // Since we built matchContent by joining pages with '\n', the separators are exactly between each part.
    // Replacing all '\n' would corrupt in-page newlines, so we rebuild outputContent explicitly.
    const outputContent = parts.join(' ');
    return { matchContent, outputContent };
};

type CompiledMistakenRule = {
    ruleIndex: number;
    // A regex that matches the marker at a line start (equivalent to lineStartsWith).
    startsWithRegex: RegExp;
};

const compileMistakenRulesAsStartsWith = (
    options: SegmentationOptions,
    selectedRuleIndices: Set<number>,
): CompiledMistakenRule[] => {
    const rules = options.rules ?? [];
    const compiled: CompiledMistakenRule[] = [];

    for (const idx of selectedRuleIndices) {
        const r = rules[idx];
        if (!r || !('lineStartsAfter' in r) || !r.lineStartsAfter?.length) {
            continue;
        }
        // Convert cleanly without using `delete` (keeps TS happy with discriminated unions).
        const { lineStartsAfter, ...rest } = r as SplitRule & { lineStartsAfter: string[] };
        const converted: SplitRule = {
            ...(rest as Omit<SplitRule, 'lineStartsAfter'>),
            lineStartsWith: lineStartsAfter,
        };

        const built = buildRuleRegex(converted);
        // built.regex has flags gmu; we want a stable, non-global matcher.
        compiled.push({ ruleIndex: idx, startsWithRegex: new RegExp(built.regex.source, 'mu') });
    }

    return compiled;
};

type Stage1Result =
    | { kind: 'recovered'; recoveredContent: string; recoveredPrefix: string }
    | { kind: 'skipped_idempotent' }
    | { kind: 'unresolved'; reason: string };

const findUniqueAnchorPos = (outputContent: string, segmentContent: string): number | null => {
    const prefixLens = [80, 60, 40, 30, 20, 15] as const;

    for (const len of prefixLens) {
        const needle = segmentContent.slice(0, Math.min(len, segmentContent.length));
        if (!needle.trim()) {
            continue;
        }

        const first = outputContent.indexOf(needle);
        if (first === -1) {
            continue;
        }
        const second = outputContent.indexOf(needle, first + 1);
        if (second === -1) {
            return first;
        }
    }

    return null;
};

const findRecoveredPrefixAtLineStart = (
    segmentContent: string,
    matchContent: string,
    lineStart: number,
    anchorPos: number,
    compiledMistaken: CompiledMistakenRule[],
): { prefix: string } | { reason: string } => {
    const line = matchContent.slice(lineStart);

    for (const mr of compiledMistaken) {
        mr.startsWithRegex.lastIndex = 0;
        const m = mr.startsWithRegex.exec(line);
        if (!m || m.index !== 0) {
            continue;
        }

        const markerMatch = m[0];
        const markerEnd = lineStart + markerMatch.length;
        if (anchorPos < markerEnd) {
            continue; // anchor is inside marker; unsafe
        }

        // If there is whitespace between the marker match and the anchored content (common when lineStartsAfter trims),
        // include it in the recovered prefix.
        const gap = matchContent.slice(markerEnd, anchorPos);
        const recoveredPrefix = /^\s*$/u.test(gap) ? `${markerMatch}${gap}` : markerMatch;

        // Idempotency: if content already starts with the marker/prefix, don’t prepend.
        if (segmentContent.startsWith(markerMatch) || segmentContent.startsWith(recoveredPrefix)) {
            return { reason: 'content already starts with selected marker' };
        }

        return { prefix: recoveredPrefix };
    }

    return { reason: 'no selected marker pattern matched at anchored line start' };
};

const tryBestEffortRecoverOneSegment = (
    segment: Segment,
    processedPages: Page[],
    pageIdToIndex: Map<number, number>,
    compiledMistaken: CompiledMistakenRule[],
    pageJoiner: 'space' | 'newline',
): Stage1Result => {
    const fromIdx = pageIdToIndex.get(segment.from);
    const toIdx = pageIdToIndex.get(segment.to ?? segment.from) ?? fromIdx;
    if (fromIdx === undefined || toIdx === undefined || fromIdx < 0 || toIdx < fromIdx) {
        return { kind: 'unresolved', reason: 'segment page range not found in pages' };
    }

    const { matchContent, outputContent } = buildRangeContent(processedPages, fromIdx, toIdx, pageJoiner);
    if (!segment.content) {
        return { kind: 'unresolved', reason: 'empty segment content' };
    }

    const anchorPos = findUniqueAnchorPos(outputContent, segment.content);
    if (anchorPos === null) {
        return { kind: 'unresolved', reason: 'could not uniquely anchor segment content in page range' };
    }

    // Find line start in matchContent. (Positions align because outputContent differs only by page-boundary joiner.)
    const lineStart = matchContent.lastIndexOf('\n', Math.max(0, anchorPos - 1)) + 1;
    const found = findRecoveredPrefixAtLineStart(segment.content, matchContent, lineStart, anchorPos, compiledMistaken);
    if ('reason' in found) {
        return found.reason.includes('already starts')
            ? { kind: 'skipped_idempotent' }
            : { kind: 'unresolved', reason: found.reason };
    }
    return { kind: 'recovered', recoveredContent: `${found.prefix}${segment.content}`, recoveredPrefix: found.prefix };
};

const resolveRuleIndicesSelector = (rules: SplitRule[], indicesIn: number[]) => {
    const errors: string[] = [];
    const indices = new Set<number>();
    for (const idx of indicesIn) {
        if (!Number.isInteger(idx) || idx < 0 || idx >= rules.length) {
            errors.push(`Selector index out of range: ${idx}`);
            continue;
        }
        const rule = rules[idx];
        if (!rule || !('lineStartsAfter' in rule)) {
            errors.push(`Selector index ${idx} is not a lineStartsAfter rule`);
            continue;
        }
        indices.add(idx);
    }
    return { errors, indices, warnings: [] as string[] };
};

const resolvePredicateSelector = (rules: SplitRule[], predicate: (rule: SplitRule, index: number) => boolean) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const indices = new Set<number>();

    rules.forEach((r, i) => {
        try {
            if (!predicate(r, i)) {
                return;
            }
            if ('lineStartsAfter' in r && r.lineStartsAfter?.length) {
                indices.add(i);
                return;
            }
            warnings.push(`Predicate selected rule ${i}, but it is not a lineStartsAfter rule; skipping`);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            errors.push(`Predicate threw at rule ${i}: ${msg}`);
        }
    });

    if (indices.size === 0) {
        warnings.push('Predicate did not select any lineStartsAfter rules');
    }

    return { errors, indices, warnings };
};

const resolvePatternsSelector = (
    rules: SplitRule[],
    patterns: string[],
    matchMode: 'exact' | 'normalized' | undefined,
): { errors: string[]; indices: Set<number>; warnings: string[] } => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const indices = new Set<number>();

    const normalizePattern = (p: string) =>
        normalizeForCompare(p, (matchMode ?? 'exact') === 'normalized' ? 'whitespace_and_nfkc' : 'none');
    const targets = patterns.map(normalizePattern);

    for (let pi = 0; pi < patterns.length; pi++) {
        const rawPattern = patterns[pi];
        const pat = targets[pi];
        const matched: number[] = [];

        for (let i = 0; i < rules.length; i++) {
            const r = rules[i];
            if (!('lineStartsAfter' in r) || !r.lineStartsAfter?.length) {
                continue;
            }
            if (r.lineStartsAfter.some((rp) => normalizePattern(rp) === pat)) {
                matched.push(i);
            }
        }

        if (matched.length === 0) {
            errors.push(`Pattern "${rawPattern}" did not match any lineStartsAfter rule`);
            continue;
        }
        if (matched.length > 1) {
            warnings.push(`Pattern "${rawPattern}" matched multiple lineStartsAfter rules: [${matched.join(', ')}]`);
        }
        matched.forEach((i) => {
            indices.add(i);
        });
    }

    return { errors, indices, warnings };
};

const resolveSelectorToRuleIndices = (options: SegmentationOptions, selector: MarkerRecoverySelector) => {
    const rules = options.rules ?? [];
    if (selector.type === 'rule_indices') {
        return resolveRuleIndicesSelector(rules, selector.indices);
    }
    if (selector.type === 'predicate') {
        return resolvePredicateSelector(rules, selector.predicate);
    }
    return resolvePatternsSelector(rules, selector.patterns, selector.match);
};

type AlignmentCandidate = { fixedIndex: number; kind: 'exact' | 'exact_suffix' | 'normalized_suffix'; score: number };

const longestCommonSuffixLength = (a: string, b: string): number => {
    const max = Math.min(a.length, b.length);
    let i = 0;
    while (i < max) {
        if (a[a.length - 1 - i] !== b[b.length - 1 - i]) {
            break;
        }
        i++;
    }
    return i;
};

// Minimum score difference required to confidently disambiguate between candidates.
// If the gap between best and second-best is smaller, we consider the match ambiguous.
const AMBIGUITY_SCORE_GAP = 5;

const scoreCandidate = (
    orig: Segment,
    fixed: Segment,
    normalizeMode: NormalizeCompareMode,
): AlignmentCandidate | null => {
    // Scoring hierarchy:
    //   exact (100)           - Content is identical, no recovery needed
    //   exact_suffix (90-120) - Fixed ends with original; fixed = marker + orig (most reliable)
    //   normalized_suffix (70-90) - Suffix match after whitespace/NFKC normalization
    // Higher scores indicate more confident alignment.

    if (fixed.content === orig.content) {
        return { fixedIndex: -1, kind: 'exact', score: 100 };
    }

    if (fixed.content.endsWith(orig.content)) {
        // Most reliable case: fixed = marker + orig.
        // Bonus points for longer markers (up to 30) to prefer substantive recovery.
        const markerLen = fixed.content.length - orig.content.length;
        const bonus = Math.min(30, markerLen);
        return { fixedIndex: -1, kind: 'exact_suffix', score: 90 + bonus };
    }

    if (normalizeMode !== 'none') {
        const normFixed = normalizeForCompare(fixed.content, normalizeMode);
        const normOrig = normalizeForCompare(orig.content, normalizeMode);
        if (normFixed.endsWith(normOrig) && normOrig.length > 0) {
            // Base score 70, plus up to 20 bonus based on overlap ratio
            const overlap = longestCommonSuffixLength(normFixed, normOrig) / normOrig.length;
            return { fixedIndex: -1, kind: 'normalized_suffix', score: 70 + Math.floor(overlap * 20) };
        }
    }

    return null;
};

const buildNoSelectionResult = (
    segments: Segment[],
    reportBase: Omit<MarkerRecoveryReport, 'details' | 'summary'>,
    mode: MarkerRecoveryReport['summary']['mode'],
    selectorErrors: string[],
): { report: MarkerRecoveryReport; segments: Segment[] } => {
    const warnings = [...reportBase.warnings];
    warnings.push('No lineStartsAfter rules selected for recovery; returning segments unchanged');

    const details: MarkerRecoveryReport['details'] = segments.map((s, i) => {
        const status: MarkerRecoveryReport['details'][number]['status'] = selectorErrors.length
            ? 'unresolved_selector'
            : 'unchanged';
        return {
            from: s.from,
            notes: selectorErrors.length ? (['selector did not resolve'] as string[]) : undefined,
            originalStartPreview: preview(s.content),
            segmentIndex: i,
            status,
            strategy: 'none',
            to: s.to,
        };
    });

    return {
        report: {
            ...reportBase,
            details,
            summary: {
                mode,
                recovered: 0,
                totalSegments: segments.length,
                unchanged: segments.length,
                unresolved: selectorErrors.length ? segments.length : 0,
            },
            warnings,
        },
        segments,
    };
};

const runStage1IfEnabled = (
    pages: Page[],
    segments: Segment[],
    options: SegmentationOptions,
    selectedRuleIndices: Set<number>,
    mode: MarkerRecoveryReport['summary']['mode'],
): {
    recoveredAtIndex: Map<number, Segment>;
    recoveredDetailAtIndex: Map<number, MarkerRecoveryReport['details'][number]>;
} => {
    const recoveredAtIndex = new Map<number, Segment>();
    const recoveredDetailAtIndex = new Map<number, MarkerRecoveryReport['details'][number]>();

    if (mode !== 'best_effort_then_rerun') {
        return { recoveredAtIndex, recoveredDetailAtIndex };
    }

    const processedPages = options.replace ? applyReplacements(pages, options.replace) : pages;
    const pageIdToIndex = buildPageIdToIndex(processedPages);
    const pageJoiner = options.pageJoiner ?? 'space';
    const compiledMistaken = compileMistakenRulesAsStartsWith(options, selectedRuleIndices);

    for (let i = 0; i < segments.length; i++) {
        const orig = segments[i];
        const r = tryBestEffortRecoverOneSegment(orig, processedPages, pageIdToIndex, compiledMistaken, pageJoiner);
        if (r.kind !== 'recovered') {
            continue;
        }

        const seg: Segment = { ...orig, content: r.recoveredContent };
        recoveredAtIndex.set(i, seg);
        recoveredDetailAtIndex.set(i, {
            from: orig.from,
            originalStartPreview: preview(orig.content),
            recoveredPrefixPreview: preview(r.recoveredPrefix),
            recoveredStartPreview: preview(seg.content),
            segmentIndex: i,
            status: 'recovered',
            strategy: 'stage1',
            to: orig.to,
        });
    }

    return { recoveredAtIndex, recoveredDetailAtIndex };
};

const buildFixedBuckets = (fixedSegments: Segment[]): Map<string, number[]> => {
    const buckets = new Map<string, number[]>();
    for (let i = 0; i < fixedSegments.length; i++) {
        const k = segmentRangeKey(fixedSegments[i]);
        const arr = buckets.get(k);
        if (!arr) {
            buckets.set(k, [i]);
        } else {
            arr.push(i);
        }
    }
    return buckets;
};

type BestFixedMatch = { kind: 'none' } | { kind: 'ambiguous' } | { kind: 'match'; fixedIdx: number };

const findBestFixedMatch = (
    orig: Segment,
    candidates: number[],
    fixedSegments: Segment[],
    usedFixed: Set<number>,
    normalizeCompare: NormalizeCompareMode,
): BestFixedMatch => {
    let best: { fixedIdx: number; score: number } | null = null;
    let secondBestScore = -Infinity;

    for (const fixedIdx of candidates) {
        if (usedFixed.has(fixedIdx)) {
            continue;
        }
        const fixed = fixedSegments[fixedIdx];
        const scored = scoreCandidate(orig, fixed, normalizeCompare);
        if (!scored) {
            continue;
        }
        const candidateScore = scored.score;
        if (!best || candidateScore > best.score) {
            secondBestScore = best?.score ?? -Infinity;
            best = { fixedIdx, score: candidateScore };
        } else if (candidateScore > secondBestScore) {
            secondBestScore = candidateScore;
        }
    }

    if (!best) {
        return { kind: 'none' };
    }
    if (best.score - secondBestScore < AMBIGUITY_SCORE_GAP && candidates.length > 1) {
        return { kind: 'ambiguous' };
    }
    return { fixedIdx: best.fixedIdx, kind: 'match' };
};

const detailUnresolved = (
    orig: Segment,
    segmentIndex: number,
    notes: string[],
): MarkerRecoveryReport['details'][number] => ({
    from: orig.from,
    notes,
    originalStartPreview: preview(orig.content),
    segmentIndex,
    status: 'unresolved_alignment',
    strategy: 'rerun',
    to: orig.to,
});

const detailSkippedIdempotent = (
    orig: Segment,
    segmentIndex: number,
    notes: string[],
): MarkerRecoveryReport['details'][number] => ({
    from: orig.from,
    notes,
    originalStartPreview: preview(orig.content),
    segmentIndex,
    status: 'skipped_idempotent',
    strategy: 'rerun',
    to: orig.to,
});

const detailRecoveredRerun = (
    orig: Segment,
    fixed: Segment,
    segmentIndex: number,
): MarkerRecoveryReport['details'][number] => {
    let recoveredPrefixPreview: string | undefined;
    if (fixed.content.endsWith(orig.content)) {
        recoveredPrefixPreview = preview(fixed.content.slice(0, fixed.content.length - orig.content.length));
    }
    return {
        from: orig.from,
        originalStartPreview: preview(orig.content),
        recoveredPrefixPreview,
        recoveredStartPreview: preview(fixed.content),
        segmentIndex,
        status: 'recovered',
        strategy: 'rerun',
        to: orig.to,
    };
};

const mergeWithRerun = (params: {
    fixedBuckets: Map<string, number[]>;
    fixedSegments: Segment[];
    normalizeCompare: NormalizeCompareMode;
    originalSegments: Segment[];
    recoveredDetailAtIndex: Map<number, MarkerRecoveryReport['details'][number]>;
    stage1RecoveredAtIndex: Map<number, Segment>;
}): {
    details: MarkerRecoveryReport['details'];
    segments: Segment[];
    summary: Omit<MarkerRecoveryReport['summary'], 'mode' | 'totalSegments'>;
} => {
    const {
        fixedBuckets,
        fixedSegments,
        normalizeCompare,
        originalSegments,
        stage1RecoveredAtIndex,
        recoveredDetailAtIndex,
    } = params;

    const usedFixed = new Set<number>();
    const out: Segment[] = [];
    const details: MarkerRecoveryReport['details'] = [];
    let recovered = 0;
    let unresolved = 0;
    let unchanged = 0;

    for (let i = 0; i < originalSegments.length; i++) {
        const stage1Recovered = stage1RecoveredAtIndex.get(i);
        if (stage1Recovered) {
            out.push(stage1Recovered);
            recovered++;
            details.push(
                recoveredDetailAtIndex.get(i) ?? {
                    from: stage1Recovered.from,
                    originalStartPreview: preview(originalSegments[i].content),
                    recoveredStartPreview: preview(stage1Recovered.content),
                    segmentIndex: i,
                    status: 'recovered',
                    strategy: 'stage1',
                    to: stage1Recovered.to,
                },
            );
            continue;
        }

        const orig = originalSegments[i];
        const candidates = fixedBuckets.get(segmentRangeKey(orig)) ?? [];

        const best = findBestFixedMatch(orig, candidates, fixedSegments, usedFixed, normalizeCompare);
        if (best.kind === 'none') {
            out.push(orig);
            unresolved++;
            details.push(detailUnresolved(orig, i, ['no alignment candidate in rerun output for same (from,to)']));
            continue;
        }
        if (best.kind === 'ambiguous') {
            out.push(orig);
            unresolved++;
            details.push(detailUnresolved(orig, i, ['ambiguous alignment (score gap too small)']));
            continue;
        }

        usedFixed.add(best.fixedIdx);
        const fixed = fixedSegments[best.fixedIdx];

        if (fixed.content === orig.content) {
            out.push(orig);
            unchanged++;
            details.push(detailSkippedIdempotent(orig, i, ['content already matches rerun output']));
            continue;
        }

        out.push({ ...orig, content: fixed.content });
        recovered++;
        details.push(detailRecoveredRerun(orig, fixed, i));
    }

    return { details, segments: out, summary: { recovered, unchanged, unresolved } };
};

export function recoverMistakenLineStartsAfterMarkers(
    pages: Page[],
    segments: Segment[],
    options: SegmentationOptions,
    selector: MarkerRecoverySelector,
    opts?: {
        mode?: 'rerun_only' | 'best_effort_then_rerun';
        normalizeCompare?: NormalizeCompareMode;
    },
): { report: MarkerRecoveryReport; segments: Segment[] } {
    const mode = opts?.mode ?? 'rerun_only';
    const normalizeCompare = opts?.normalizeCompare ?? 'whitespace';

    const resolved = resolveSelectorToRuleIndices(options, selector);
    const reportBase: Omit<MarkerRecoveryReport, 'details' | 'summary'> = {
        byRun: undefined,
        errors: resolved.errors,
        warnings: resolved.warnings,
    };

    if (resolved.indices.size === 0) {
        return buildNoSelectionResult(segments, reportBase, mode, resolved.errors);
    }

    const stage1 = runStage1IfEnabled(pages, segments, options, resolved.indices, mode);

    const fixedOptions = buildFixedOptions(options, resolved.indices);
    const fixedSegments = segmentPages(pages, fixedOptions);
    const fixedBuckets = buildFixedBuckets(fixedSegments);
    const merged = mergeWithRerun({
        fixedBuckets,
        fixedSegments,
        normalizeCompare,
        originalSegments: segments,
        recoveredDetailAtIndex: stage1.recoveredDetailAtIndex,
        stage1RecoveredAtIndex: stage1.recoveredAtIndex,
    });

    return {
        report: {
            ...reportBase,
            details: merged.details,
            summary: {
                mode,
                recovered: merged.summary.recovered,
                totalSegments: segments.length,
                unchanged: merged.summary.unchanged,
                unresolved: merged.summary.unresolved,
            },
        },
        segments: merged.segments,
    };
}

export function recoverMistakenMarkersForRuns(
    runs: MarkerRecoveryRun[],
    opts?: { mode?: 'rerun_only' | 'best_effort_then_rerun'; normalizeCompare?: NormalizeCompareMode },
): { report: MarkerRecoveryReport; segments: Segment[] } {
    const allSegments: Segment[] = [];
    const byRun: NonNullable<MarkerRecoveryReport['byRun']> = [];
    const details: MarkerRecoveryReport['details'] = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    let recovered = 0;
    let unchanged = 0;
    let unresolved = 0;
    let offset = 0;

    for (let i = 0; i < runs.length; i++) {
        const run = runs[i];
        const res = recoverMistakenLineStartsAfterMarkers(run.pages, run.segments, run.options, run.selector, opts);
        allSegments.push(...res.segments);

        // Adjust indices in details to be global
        for (const d of res.report.details) {
            details.push({ ...d, segmentIndex: d.segmentIndex + offset });
        }
        offset += run.segments.length;

        recovered += res.report.summary.recovered;
        unchanged += res.report.summary.unchanged;
        unresolved += res.report.summary.unresolved;

        warnings.push(...res.report.warnings);
        errors.push(...res.report.errors);

        byRun.push({
            recovered: res.report.summary.recovered,
            runIndex: i,
            totalSegments: run.segments.length,
            unresolved: res.report.summary.unresolved,
        });
    }

    const report: MarkerRecoveryReport = {
        byRun,
        details,
        errors,
        summary: {
            mode: opts?.mode ?? 'rerun_only',
            recovered,
            totalSegments: offset,
            unchanged,
            unresolved,
        },
        warnings,
    };

    return { report, segments: allSegments };
}
