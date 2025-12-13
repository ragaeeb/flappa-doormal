# Memory and Garbage-Collection Review

Findings are ordered from highest to lowest priority for workloads that can reach 10k–20k pages.

## 1) Breakpoint scanning materializes every regex match per window
- **Where**: `findPatternBreakPosition` (`src/segmentation/breakpoint-utils.ts`).
- **Issue**: Collects an array of `{index, length}` for every `matchAll` hit even though only the first or last match is used. On dense patterns and large windows (when shrinking oversize segments) this creates thousands of short-lived objects per breakpoint probe.
- **Impact**: Elevated young-gen GC when scanning 10k–20k pages with many breakpoints; CPU wasted copying match arrays.
- **Fix (recommended)**: Stream matches and keep only the running first/last candidate. For `prefer: "shorter"`, bail out on the first match; for `prefer: "longer"`, keep the latest seen match and stop at iteration end. This makes allocations O(1) per scan.

## 2) Full corpus duplicated during page-map construction and fallback build
- **Where**: `buildPageMap` and fallback `allContent` construction in `segmentPages` (`src/segmentation/segmenter.ts`).
- **Issue**: We keep `parts` (normalized pages), `parts.join("\n")`, and potentially `pages.map(...).join("\n")` when no rule matches. That can leave 2–3 copies of the full corpus alive concurrently.
- **Impact**: For 20k pages, duplicated buffers can push memory over 2× the book size, stressing GC and risking OOM on constrained hosts.
- **Fix (recommended)**:
  - Reuse `matchContent` for the fallback segment instead of rejoining `pages`.
  - After building `matchContent`, allow `parts` to be cleared or reused (e.g., pass the normalized array out and drop the local reference once consumers exist).
  - Consider an option to scan rules directly over `normalizedPages` to avoid the joined-string copy when memory is the bottleneck.

## 3) Rule processing stores all matches before occurrence filtering
- **Where**: `findMatches` + `filterByOccurrence` in `segmentPages` (`src/segmentation/segmenter.ts`).
- **Issue**: `allMatches` retains every regex hit even when `occurrence` is `first`/`last`. Dense patterns on long books can accumulate far more matches than the caller needs.
- **Impact**: Transient arrays and match objects grow with corpus density, increasing GC churn during rule evaluation.
- **Fix (recommended)**: When `occurrence` is `first` or `last`, stream the regex scan: keep only the first seen match or the latest seen match and stop early when possible. Reserve the full array only for `all`/`unique` cases.

## 4) Page-break normalization re-allocates per segment
- **Where**: `convertPageBreaks` (`src/segmentation/segmenter.ts`).
- **Issue**: Always builds a `Set` and runs `String.replace` with a callback, producing a new string even when the segment has zero page breaks or no newlines.
- **Impact**: For highly segmented outputs, repeated `Set` creation and `replace` callbacks add steady GC noise.
- **Fix (recommended)**: Fast-path when `breaksInRange` is empty (already done) and also when `content.indexOf("\n") === -1`. When exactly one break exists, compare the single offset instead of building a `Set`. These checks avoid extra allocations for the majority case.

## 5) Breakpoint exclusion scans allocate repeatedly
- **Where**: `hasExcludedPageInRange` and `findBreakPosition` (`src/segmentation/breakpoint-utils.ts`).
- **Issue**: Each breakpoint evaluation creates temporary booleans while iterating the window range. When windows slide many times for oversize segments, this becomes a hot loop.
- **Impact**: Minor but steady GC pressure when many `exclude` rules are present.
- **Fix (recommended)**: Cache exclusion decisions per `(rule, pageIdx)` during a single `applyBreakpoints` pass, or precompute a boolean array aligned to `pageIds` to allow O(1) checks without per-iteration object churn.

---

### Quick win order
1. **Stream breakpoint match scan** (no behavior change, highest allocation drop in hot path).
2. **Eliminate duplicate corpus joins** (cuts peak memory for large books).
3. **Occurrence-aware rule scanning** (avoids unnecessary match arrays).
4. **Cheap page-break conversion fast paths** (reduces per-segment churn).
5. **Cache exclusion checks** (minor, apply if profiling shows hotspot).