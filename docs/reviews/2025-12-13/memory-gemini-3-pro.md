# Memory Analysis & Optimization Review

**Date:** 2025-12-13
**Agent:** Gemini 3 Pro
**Scope:** Memory usage and garbage production in `flappa-doormal` segmentation engine.

## Executive Summary

The segmentation engine is currently performing well, processing 50,000 pages (approx. 50MB of text) in ~200ms with ~200MB of memory usage. While the current performance is acceptable, there are opportunities to reduce memory footprint by eliminating data duplication during the segmentation process.

## Methodology

1.  **Codebase Analysis**: Reviewed `src/segmentation/segmenter.ts`, `src/segmentation/breakpoint-utils.ts`, and related files to identify potential memory hotspots.
2.  **Benchmarking**: Created and executed a stress test script (`perf-test.ts`) generating 50,000 pages with mixed English and Arabic content to simulate realistic load.
3.  **Profiling**: Measured memory usage (RSS, Heap Used) and execution time using Node.js/Bun process metrics.

## Findings

### 1. Performance Baseline
-   **Input**: 50,000 pages (~1KB each, total ~50MB raw text).
-   **Execution Time**: ~210ms (on local environment).
-   **Memory Usage**: ~206MB heap used.
-   **Throughput**: Highly efficient for the tested volume.

### 2. Identified Hotspots
The primary source of "excess" memory usage is data duplication during the preparation phase of segmentation:

*   **`buildPageMap` Duplication**:
    *   Creates `parts: string[]` (array of normalized page content).
    *   Joins `parts` into a giant `content` string.
    *   *Potential Optimization*: The `parts` array is returned as `normalizedPages` (as `string[]`), but `applyBreakpoints` later rebuilds a `Map<number, NormalizedPage>` from this array, duplicating the data structure overhead.

*   **`applyBreakpoints` Redundancy**:
    *   Iterates over the `normalizedContent` array to build a new `Map<number, NormalizedPage>`.
    *   This map construction is O(N) and creates new objects for every page, which increases GC pressure.

*   **String Processing in `breakpoint-utils.ts`**:
    *   Functions like `findActualStartPage` and `findActualEndPage` perform string slicing (`slice(0, 30)`) and matching without first checking if the content is empty or large enough to match. This creates unnecessary temporary string objects.

## Improvement Suggestions

### 1. Optimize Data Structures in `buildPageMap`
**Recommendation**: Modify `buildPageMap` to return the `Map<number, NormalizedPage>` directly instead of a string array.

```typescript
// Current
return {
    content: parts.join('\n'),
    normalizedPages: parts, // string[]
    pageMap: ...
}

// Proposed
const normalizedPages = new Map<number, NormalizedPage>();
// ... populate map during loop ...
return {
    content: parts.join('\n'),
    normalizedPages, // Map<number, NormalizedPage>
    pageMap: ...
}
```

**Benefit**:
*   Avoids reconstructing the map in `applyBreakpoints`.
*   Provides O(1) lookups immediately.
*   Reduces intermediate array allocation.

### 2. Refactor `applyBreakpoints` Signature
**Recommendation**: Update `applyBreakpoints` to accept the pre-built `Map` instead of the string array.

```typescript
const applyBreakpoints = (
    segments: Segment[],
    pages: Page[],
    normalizedPages: Map<number, NormalizedPage>, // Receive Map directly
    // ...
)
```

**Benefit**:
*   Removes the O(N) map initialization loop inside `applyBreakpoints`.
*   Passes reference to existing data structure.

### 3. Guard Clauses for String Operations
**Recommendation**: Add length checks in `findActualStartPage` and `findActualEndPage` before performing string operations.

```typescript
// Example Optimization
if (pageData.length === 0) continue;
const pagePrefix = pageData.content.slice(0, Math.min(30, pageData.length)).trim();
if (pagePrefix.length === 0) continue;
```

**Benefit**:
*   Prevents allocation of substrings for empty or whitespace-only pages.
*   Reduces minor GC churn in tight loops.

## Conclusion
The system is currently robust. The suggested optimizations are primarily "good hygiene" improvements to reduce memory pressure as dataset sizes grow beyond 50k pages. They focus on passing references rather than recreating derived data structures.

> **Note**: A previous attempt to apply these changes was reverted. Any future implementation should be carefully verified against edge cases in `applyBreakpoints` to ensure the `Map` logic exactly matches the original array-based indexing behavior.
