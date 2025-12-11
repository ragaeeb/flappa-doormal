# Performance Analysis: Scaling to 10k Pages

Gemini 3

## Executive Summary

The current implementation of `segmenter.ts` is robust but has inefficiencies that will become significant when scaling to 10,000 pages (~20MB+ of text).

**Key Findings:**
1.  **Memory Redundancy:** Content is normalized and copied multiple times (3-4x duplication).
2.  **Inefficient Rule Matching:** Regexes run over the *entire* concatenated content even when rules are constrained to specific page ranges.
3.  **Complexity:** `applyBreakpoints` is computationally intensive, though recent optimizations have improved it significantly.

---

## 1. Memory Usage Analysis

For 10k pages (~20MB raw text):
- **Raw Input:** ~20MB
- **`buildPageMap`:** Creates `parts` array + joined `content` string (~20MB).
- **`applyBreakpoints`:** Creates `normalizedPages` map (~20MB).
- **Intermediate Strings:** Slicing and concatenation in loops create transient garbage.

**Total Memory Footprint:** ~60-80MB for text alone, plus object overhead.

**Recommendation:**
- Implement a **Shared Content Cache**. Normalize pages *once* at the entry point and pass this immutable structure to all functions (`buildPageMap`, `applyBreakpoints`, etc.).
- Avoid creating the massive joined string if possible, or create it once and reuse it.

## 2. Rule Matching Efficiency (The "Biggest Gain")

Currently, `segmentPages` works like this:
1.  Join ALL pages into one huge string.
2.  For EACH rule:
    *   Run regex over the HUGE string.
    *   Filter results based on page constraints (`min`, `max`, `exclude`).

**The Problem:**
If a rule says `min: 9000` (only applies to the last 1000 pages), we still regex-search the first 9000 pages (18MB of useless scanning) and then throw away the matches.

**The Fix:**
**Constraint-Aware Searching.**
- Use the `PageMap` to translate page constraints (`min`, `max`) into *character offsets*.
- Slice the huge string to *only* the relevant range before running `exec`.
- **Impact:** For rules targeting specific sections (common in structured books), this reduces regex time from O(TotalContent) to O(RelevantContent).

## 3. `applyBreakpoints` Optimization

Recent optimizations (pre-normalization, cumulative offsets, Sets) have reduced complexity from O(S×P×B×C) to O(S×B×C).

**Remaining Bottlenecks:**
- **String Slicing:** `remainingContent.slice(...)` creates new strings in every iteration.
- **Regex on Windows:** `windowContent.matchAll(regex)` runs on the window text.

**Recommendation:**
- Instead of slicing strings, work with **indices** as much as possible.
- Only slice the final segment content when pushing to the result array.
- Pass the full `normalizedContent` and `(start, end)` indices to helper functions.

## 4. Implementation Plan

### Phase 1: Shared Normalization (Memory & Speed)
Refactor `segmentPages` to create a `NormalizedContent` object once.

```typescript
type NormalizedContent = {
    raw: string[];      // Original content
    normalized: string[]; // Pre-normalized content
    joined: string;     // Full joined string (lazy or cached)
    pageMap: PageMap;
};
```

### Phase 2: Constraint-Aware Rule Matching (Speed)
Modify `findMatches` to accept a search range.

```typescript
// Before
const allMatches = findMatches(matchContent, regex, ...);

// After
const startOffset = rule.min ? pageMap.getStartOffset(rule.min) : 0;
const endOffset = rule.max ? pageMap.getEndOffset(rule.max) : matchContent.length;
// Only search relevant slice (or use lastIndex if careful)
const relevantContent = matchContent.slice(startOffset, endOffset);
const matches = findMatches(relevantContent, regex, ...);
```

### Phase 3: Class Extraction
Extract `applyBreakpoints` into a `BreakpointProcessor` class to encapsulate the complex logic and pre-computed data structures.

## Conclusion

The biggest performance gain for 10k pages will come from **Phase 2 (Constraint-Aware Matching)**. If you have 50 rules and each applies to only 10% of the book, this optimization could speed up the segmentation phase by **10x**.

---

# Critique and Alternative Analysis

**Reviewer:** Claude Opus 4

## Critique of Above Analysis

### What's Accurate ✅

1. **Memory duplication is real** - `buildPageMap` (line 233) normalizes content into `parts[]`, then `applyBreakpoints` (line 486) re-normalizes into `normalizedPages`. This is ~20MB duplicated for 10k pages.

2. **Constraint-aware matching concept is sound** - Searching only relevant pages when `min`/`max` are specified would reduce work.

### What's Overengineered ⚠️

#### 1. The "10x Speedup" Claim is Unrealistic

Looking at actual usage in this codebase:
- Most rules **don't have** `min`/`max` constraints (they apply book-wide)
- Only ~5 test cases use `min:` at all
- For a one-time batch operation on 10k pages, even 1-2 seconds of regex matching is acceptable

#### 2. Phase 1's `NormalizedContent` Type Adds Unnecessary Abstraction

The proposed type couples `buildPageMap` and `applyBreakpoints` tightly. Currently they're independent - simpler to maintain.

#### 3. String Slicing is NOT a Bottleneck

V8 optimizes substring operations heavily. For short-lived slices, the overhead is negligible compared to regex matching.

#### 4. Phase 3 (Class Extraction) is Premature Optimization

Converting to a class doesn't make code faster - it just reorganizes it. Not worth the refactoring effort.

---

## My Analysis: Actual Biggest Gains

### Issue #1: Duplicate Normalization (CONCRETE, EASY FIX)

**Location:** 
- `buildPageMap` line 240: `normalizeLineEndings(pages[i].content)`
- `applyBreakpoints` line 488: `pages[i].content.replace(/\r\n?/g, '\n')`

**Problem:** We normalize every page's content TWICE.

**Fix:** Have `buildPageMap` return the `parts[]` array it already creates:

```diff
// Line 277-285 in buildPageMap
return {
    content: parts.join('\n'),
+   normalizedPages: parts,  // Already normalized!
    pageMap: { ... }
};

// Then applyBreakpoints can use this instead of re-normalizing
```

**Impact:** Eliminates ~20MB of redundant string processing. **~5 lines changed.**

---

### Issue #2: `pageIds.indexOf()` Called Repeatedly (CONCRETE, EASY FIX)

**Location:** `applyBreakpoints` lines 533-534:
```typescript
const fromIdx = pageIds.indexOf(segment.from);
const toIdx = segment.to !== undefined ? pageIds.indexOf(segment.to) : fromIdx;
```

**Problem:** `indexOf` is O(P) per call. For S segments, this is O(S × P).

**Fix:** Build a Map<pageId, index> once:
```typescript
const pageIdToIndex = new Map(pageIds.map((id, i) => [id, i]));
// Then: const fromIdx = pageIdToIndex.get(segment.from)!;
```

**Impact:** O(S × P) → O(S). **~3 lines changed.**

---

### Issue #3: Content Prefix Search for `to` Field (MODERATE)

**Location:** Lines 698-714 - searching for page content prefix in `pieceContent`:
```typescript
for (let pi = toIdx; pi > currentFromIdx; pi--) {
    const matchPos = pieceContent.indexOf(checkPortion);
    ...
}
```

**Problem:** `indexOf` on large strings is O(C) per call. In worst case, O(P × C).

**Fix:** Use the cumulative offsets to calculate the expected position directly instead of searching.

---

### Issue #4: `convertPageBreaks` Creates Character Array (MINOR)

**Location:** Line 403: `const chars = Array.from(content);`

**Problem:** Creates a full array copy of potentially large content.

**Fix:** Use `replaceAll` with the specific break indices, or keep as-is since this is only called on individual segments (not the full 20MB).

---

## Recommended Action Plan

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| 1 | Duplicate normalization | ~5 lines | ~20MB memory saved |
| 2 | `indexOf` → Map | ~3 lines | O(S×P) → O(S) |
| 3 | Content prefix search | ~10 lines | O(P×C) → O(1) in best case |
| 4 | Constraint-aware matching | ~30 lines | Only helps if rules use `min`/`max` |

**Bottom Line:** Issues #1 and #2 are quick wins with concrete measurable impact. Issues #3 and #4 are only worth doing if profiling shows they're actual bottlenecks.

---

# Additional Critique and Recommendations (gpt-5.1-codex-max)

## Where I Agree
- ✅ Duplicate normalization is a real, easy win. Reuse the already-normalized `parts` from `buildPageMap` and avoid the second pass in `applyBreakpoints`.
- ✅ `pageId → index` map is a near-zero-risk speedup; worth doing.

## Where I’m Skeptical
- ⚠️ Constraint-aware slicing/ranging: Helps only if many rules have tight `min`/`max`. Most rules here are global; added branching may deliver little benefit. Profile first.
- ⚠️ Class extraction / heavy structural refactors: Adds complexity without performance gain.
- ⚠️ Replacing prefix search with offset math: Risky if content is altered (trimming, normalization). Keep correctness-first; optimize only if profiling flags it.
- ⚠️ convertPageBreaks micro-optimizations: Already segment-scoped; low ROI after the Set→sorted array change.

## Missed Opportunities / Likely Bigger Wins
- 🔎 **Profile regex hotspots.** The dominant cost is regex over large concatenated content. Add lightweight timers around `findMatches` per rule to spot pathological patterns; simplify or pre-filter those first.
- ⏩ **Early-exit for occurrence-first/last.** If a rule needs only first/last, stop scanning after it’s found; avoids full-string scans for those cases.
- 🧭 **Range-guarded regex without slicing.** If `min`/`max` exist, set `lastIndex`/end guards based on offsets instead of slicing; narrows work without allocations.
- 🧰 **Optional/lazy normalized page cache.** If breakpoints aren’t used, skip building the per-page normalized map to lower baseline memory.
- 🧪 **Focus on correctness for `to` detection.** If tuning, prefer using existing cumulative offsets but keep safeguards; don’t trade off robustness.

## My Recommended Order of Work
1) Remove duplicate normalization (certain win, tiny diff).  
2) Add `pageId→index` map (tiny diff, certain win).  
3) Add early-exit for occurrence-first/last in `findMatches`.  
4) Add lightweight profiling to identify regex hot rules before deeper changes.  
5) Consider range-guarded regex runs only if profiling shows many constrained rules.  
6) Defer larger refactors (classes, aggressive index math) unless profiling justifies.

---

# Final Synthesis: Consensus & Verification

**Reviewer:** Claude Opus 4.5 (after reviewing all three analyses against actual code)

## All Three Agree ✅ (Do These)

| Optimization | Gemini | Claude | GPT-5.1 | Verdict |
|--------------|--------|--------|---------|---------|
| Remove duplicate normalization | ✅ | ✅ | ✅ | **DO IT** - ~5 lines, ~20MB saved |
| `pageId→index` Map | ✅ | ✅ | ✅ | **DO IT** - ~3 lines, O(S×P)→O(S) |

## Disputed Claims (Verified Against Code)

### GPT-5.1's "Early-exit for occurrence-first/last" ❌ NOT APPLICABLE

**The claim:** If a rule needs only first/last match, stop scanning early.

**Code reality (verified):**
- `findMatches` (line 318) collects ALL matches first
- `filterByOccurrence` (line 796 in `segmentPages`) filters AFTER the full scan
- You CAN'T early-exit because `occurrence: 'first'` may still need `min`/`max` filtering first, and ordering depends on position in the content

**Verdict:** Would require significant refactoring to change the pipeline order. Not a quick win.

### Gemini's "Constraint-Aware Matching = 10x speedup" ⚠️ OVERSTATED

**The claim:** Slice content before regex if `min`/`max` present.

**Code reality:**
- Only ~5 test cases use `min:` at all
- Most real rules apply book-wide (no constraints)
- The pipeline is: regex ALL → filter by constraints → filter by occurrence
- Changing to: calculate range → slice → regex = new allocations + offset adjustments

**Verdict:** Theoretically sound but limited practical impact. Save for later if profiling shows specific rules are slow.

### Claude's "Content prefix search is O(P×C)" ⚠️ OVERSTATED

**Location:** Lines 698-714 - backward search for `to` field

**Code reality:**
- This loop runs only for oversized segments being split
- It exits on FIRST match (`break` at line 710)
- Most segments span 2-3 pages, not thousands

**Verdict:** Not a hot path. Keep it for correctness.

---

## Final Prioritized Action Plan

### Phase 1: Immediate Wins (Do Now)
```
1. Duplicate normalization fix       [~5 lines]  → 20MB memory saved
2. pageId→index Map                  [~3 lines]  → O(S×P) → O(S)
```

### Phase 2: Complexity Reduction (Do After Phase 1)
```
3. Extract `applyBreakpoints` logic into smaller helper functions
   - Reduces 158 biome complexity warning
   - Makes code more testable
   - NOT for performance, but for maintainability
```

### Phase 3: Profile-Driven (Only If Needed)
```
4. Constraint-aware regex (only if profiling shows constrained rules are common)
5. Early-exit for occurrence (requires pipeline restructuring - high effort)
```

---

## Conclusion

**Gemini** overengineered with class extraction and 10x claims.  
**GPT-5.1** suggested early-exit without checking the actual code flow.  
**Claude** (me) correctly identified the quick wins but overstated the `to` field issue.

The **real quick wins** are items #1 and #2, which all three independently agreed on. Everything else is premature optimization until we have profiling data showing actual bottlenecks in production.

**Next Steps:**
1. Implement Phase 1 optimizations (~8 lines of code)
2. Break down `applyBreakpoints` into smaller functions for maintainability
3. Add simple timing logs if performance becomes an issue
