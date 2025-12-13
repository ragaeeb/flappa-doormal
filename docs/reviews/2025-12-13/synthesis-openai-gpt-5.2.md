## Memory & GC Synthesis (2025-12-13)

**Author:** openai-gpt-5.2  
**Scope:** Synthesize memory/GC findings from:
- `memory-openai-5.1-codex-max.md`
- `memory-claude-sonnet-4.5-extended.md`
- `memory-gemini-3-pro.md`
- `memory-claude-opus-high-4.5.md`

Then add a deeper, code-driven assessment for **Maktabah Shamela** workloads (few hundred → ~40,000 pages; Arabic with/without diacritics; hadith vs non-hadith).

---

### Executive summary

- **The primary peak-memory driver** is holding multiple whole-corpus representations at once: original page strings, normalized page strings, and the fully concatenated `matchContent` string. At Shamela scale, this can become the limiting factor before CPU.
- **The primary GC/churn driver** is repeated **string slicing + trimming** in `applyBreakpoints` and allocation-heavy scans like `matchAll()` collection for breakpoints.
- Several suggestions across agents are solid “surgical” optimizations; a few are **overkill** unless profiling shows real pain at 40k pages with large page sizes.

---

### What all agents agree on (common hotspots)

#### **1) Breakpoint pattern scanning allocates too much**
- **Where:** `src/segmentation/breakpoint-utils.ts` → `findPatternBreakPosition`
- **Symptom:** Current implementation collects *all* matches in an array, then picks first/last.
- **Consequence:** High young-gen churn for dense punctuation/newline patterns when splitting oversized segments.

#### **2) Corpus-scale string building dominates peak memory**
- **Where:** `src/segmentation/segmenter.ts` → `buildPageMap()` and the “no rules / no split points” fallback.
- **Symptom:** Large strings + arrays of strings can coexist.
- **Consequence:** Peak heap can approach multiple × corpus size (especially with UTF-16 strings).

#### **3) Many “small objects” are created during matching**
- **Where:** `src/segmentation/segmenter.ts` → `findMatches()`, split points, segments
- **Consequence:** Typically acceptable, but can add noticeable GC time on very dense matches.

---

### Unique recommendations (deduplicated) across agent reports

#### **A) Stream breakpoint scans instead of materializing matches** (openai-5.1-codex-max, claude-opus-high-4.5)
- **Idea:** Don’t allocate `matches[]`; keep only first/last candidate.
- **Benefit:** Large reduction in per-window allocations; minimal complexity.
- **Risk:** Low (behavior-preserving if done carefully; must reset `regex.lastIndex` and preserve flags).

#### **B) Avoid duplicate corpus joins in fallback path** (openai-5.1-codex-max)
- **Idea:** Reuse `matchContent` from `buildPageMap()` instead of rebuilding `allContent` via `pages.map(...).join('\n')`.
- **Benefit:** Reduces peak memory spikes in the “no split points” case.
- **Risk:** Low.

#### **C) Occurrence-aware rule scanning (first/last streaming)** (openai-5.1-codex-max)
- **Idea:** If `occurrence` is `first` or `last`, don’t store all matches—keep only what you need.
- **Benefit:** Big win for dense rules on long books.
- **Risk:** Medium (needs careful integration with constraints + pageId mapping).

#### **D) Refactor `applyBreakpoints` to use offsets rather than slicing strings** (claude-sonnet-4.5-extended)
- **Idea:** Treat `segment.content` as a backing store; move `startOffset` rather than `remainingContent = remainingContent.slice(...)`.
- **Benefit:** Potentially the biggest GC win during breakpoint splitting.
- **Risk:** Medium (must ensure page attribution logic and breakpoint windowing still compute correctly).

#### **E) Optimize `convertPageBreaks` fast paths** (openai-5.1-codex-max, claude-sonnet-4.5-extended)
- **Idea:** Avoid `Set` + regex callback when no newline exists, or when there is a single break; possibly build via slices/join.
- **Benefit:** Moderate for workloads generating many multi-page segments.
- **Risk:** Low.

#### **F) Cache exclusion checks** (openai-5.1-codex-max)
- **Idea:** Cache per-pass per-window exclusion decisions or build a boolean array aligned to `pageIds`.
- **Benefit:** Likely small; only matters with heavy excludes and lots of window iterations.
- **Risk:** Low-to-medium (extra state, complexity).

#### **G) Don’t rebuild normalized page maps inside `applyBreakpoints`** (gemini-3-pro)
- **Idea:** Build `Map<number, NormalizedPage>` once (e.g., in `buildPageMap`) and pass it through.
- **Benefit:** Avoid O(P) object creation per call; reduce GC and init time.
- **Risk:** Medium (API + internal refactor; also Map overhead vs arrays).

#### **H) Guard clauses for tiny/empty page strings in `findActualStartPage/EndPage`** (gemini-3-pro)
- **Idea:** Don’t slice/trim if page is empty.
- **Benefit:** Small.
- **Risk:** Low.

#### **I) Add profiling hooks in `perf-test.ts`** (claude-sonnet-4.5-extended)
- **Idea:** Print `process.memoryUsage()` deltas and timings around key phases.
- **Benefit:** Helps validate whether improvements matter for Shamela.
- **Risk:** Low.

#### **J) “Streaming / chunked mode” for truly massive books** (claude-sonnet-4.5-extended, claude-opus-high-4.5)
- **Idea:** Process in chunks to cap peak memory.
- **Benefit:** Only real way to keep memory bounded for worst-case 40k×(large page size).
- **Risk:** High (algorithmic complexity; cross-page matching correctness; page tracking; breakpoint behavior).

---

### Deep codebase review (what I think was missed)

#### **1) Peak memory is worse than the 50k×1KB perf test suggests**
`perf-test.ts` uses 50k pages × 1KB ≈ 50MB raw. Shamela pages can be significantly larger depending on extraction/HTML stripping. Also:
- JS strings are typically **UTF-16**, so 200MB of Arabic text can become ~400MB just for character storage, plus overhead.
- The engine keeps at least:
  - Original `pages[i].content`
  - Normalized page strings (via `normalizeLineEndings`)
  - Concatenated `matchContent`
  - Derived arrays/maps and match objects

This means 40k pages can be fine in many cases, but **it is plausible to OOM** on big books with large pages.

#### **2) The “normalize line endings” phase is a hidden full-corpus pass**
- **Where:** `normalizeLineEndings` in `src/segmentation/textUtils.ts` is applied per page in `buildPageMap`.
- It’s a full regex replace over every page string. Even if the JS engine returns the original string when no matches exist, it still performs a scan.
- **Why it matters:** For 40k pages, this is a non-trivial CPU pass and can keep both original and normalized strings alive depending on inputs.
- **Potential improvement (low-risk):** Fast-path `if (!content.includes('\r')) return content;` before regex replace.

This didn’t show up in the other reports.

#### **3) Split-point storage can explode for dense rules**
`segmentPages` currently:
- runs `findMatches()` → returns an array for each rule
- filters constraints → returns another array
- occurrence filtering → returns another array
- pushes into `splitPoints[]` for every match
- then builds `byIndex = new Map<number, SplitPoint>()` of **all unique indices**

If a rule is dense (e.g., splitting on `\n` or punctuation) on a 40k-page corpus, you can wind up with **very large match arrays + split-point arrays**, even if the end goal is to reduce them. The “occurrence-aware streaming” recommendation addresses only part of this.

What’s missing is the more general point: **rules that can match extremely frequently should be discouraged** or guarded (documentation + optional limits), because they can turn the whole pipeline into “collect millions of match objects”.

#### **4) `applyBreakpoints` uses repeated `slice().trim()` and can create quadratic-ish churn**
Sonnet flagged this correctly; I’ll add a nuance:
- Each `remainingContent = remainingContent.slice(breakPosition).trim()` allocates a new string that can be nearly as large as the old one.
- With many iterations, total bytes copied can be much larger than the segment size.

For Shamela-scale oversized segments, this can become the #1 GC hotspot even if everything else is optimized.

#### **5) `detectTokenPatterns()` is algorithmically O(matches²) for overlaps**
This is not a runtime hotspot for segmentation (it’s a UX helper), but for completeness:
- `coveredRanges.some(...)` inside the loop can become expensive for long text selections.
- If you ever use this on large excerpts (e.g., a whole page), it can allocate many `DetectedPattern` objects and do heavy overlap checking.

Probably fine; just not mentioned.

---

### My ranked plan for Shamela workloads (what to do vs. what to avoid)

#### **Do (high confidence / high ROI)**
1. **Stream breakpoint match scanning** in `findPatternBreakPosition` (A)  
   - Big allocation drop, tiny complexity.
2. **Refactor `applyBreakpoints` to use offsets, not string slicing** (D)  
   - This is the most important GC win for large, breakpoint-heavy processing.
3. **Remove fallback duplicate join** and reuse `matchContent` (B)  
   - Simple, prevents avoidable peak spikes.

#### **Should do (good ROI, moderate effort)**
4. **Occurrence-aware scanning for `first`/`last`** (C)  
   - Helps avoid unnecessary match arrays on dense rules.
5. **Optimize `convertPageBreaks` fast paths** (E)  
   - Cheap improvement; matters for many multi-page segments.
6. **Fast-path `normalizeLineEndings`** (my finding #2)  
   - Low-risk CPU win at scale.

#### **Maybe (only after profiling a real 40k-page Shamela corpus)**
7. **Avoid rebuilding normalized page map in `applyBreakpoints`** (G)  
   - Worth it if breakpoints is used frequently and page count is huge.
8. **Cache exclusion checks** (F)  
   - Only matters if excludes are heavily used and window iterations are many.
9. **Micro-guards in `findActualStartPage/EndPage`** (H)  
   - Low impact; do only if profiling shows it’s hot.

#### **Avoid for now (overengineering / high risk)**
10. **“Streaming / chunked segmentation mode”** (J)  
   - This is the only way to truly cap memory for worst-case huge inputs, but it’s a major algorithm redesign:
     - cross-page regex behavior becomes tricky
     - page tracking + breakpoints correctness becomes fragile
   - I’d only do this if you can demonstrate OOMs on real Shamela books that you must support in-process.

---

### Practical guidance for the project’s purpose

For Shamela books, the distribution matters:
- **Hadith books**: many structured markers; likely lots of segments; breakpoints may be less needed if rules are good.
- **Non-hadith books**: fewer strong markers; may rely on breakpoints (`maxPages`) more, which puts pressure on `applyBreakpoints`.
- **Diacritics variance**: fuzzy expansion increases regex complexity but happens at rule-compile time; runtime cost mostly depends on regex density and corpus size.

The strongest “avoid foot-guns” advice:
- Discourage extremely dense split rules (punctuation/newline-as-rule) unless combined with occurrence/maxSpan/breakpoints logic.
- Prefer a small set of structural rules + post-processing breakpoints, which matches the library’s design.

---

### Suggested measurement plan (before/after)

To decide what’s truly worth it for 40k-page Shamela:
- Add a perf harness that uses **realistic Arabic page sizes** (e.g., 2–10KB) and mixed diacritics.
- Track:
  - `process.memoryUsage().heapUsed`, `rss`, and peak (sampled)
  - runtime for: buildPageMap, rules scan, buildSegments, applyBreakpoints
- Run at:
  - 1k pages, 10k pages, 40k pages
  - with/without `maxPages+breakpoints`
  - with a dense-breakpoint config (e.g., `['\\n', '']`) to stress the breakpoint loop

---

### My opinionated conclusion

If you want this to be robust for Shamela’s upper end (40k pages), **optimize the breakpoint hot path and reduce peak corpus duplication first**. Those changes are high ROI and low-to-medium risk. Anything beyond that (true streaming segmentation) is likely overengineering until you have concrete OOM or multi-second GC traces on real data.


