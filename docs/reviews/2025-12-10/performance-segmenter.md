# Performance Analysis: segmenter.ts

## Overview

Reviewed the segmentation engine for performance bottlenecks. The file is ~967 lines with several functions containing nested loops.

---

## Complexity Analysis

### Variables
- `P` = number of pages
- `S` = number of segments
- `B` = number of breakpoints
- `R` = number of rules
- `C` = total content length (characters)
- `M` = number of regex matches

---

## Function-by-Function Analysis

### 1. [buildPageMap](file:///Users/rhaq/workspace/flappa-doormal/src/segmentation/segmenter.ts#213-287) (lines 233-286) ✅ **O(P)** - Efficient
- Single loop over pages
- Binary search for ID lookup: **O(log P)**
- Well-optimized

### 2. [findMatches](file:///Users/rhaq/workspace/flappa-doormal/src/segmentation/segmenter.ts#309-344) (lines 318-343) ✅ **O(M)** - Efficient
- Linear in number of regex matches

### 3. [findBreaksInRange](file:///Users/rhaq/workspace/flappa-doormal/src/segmentation/segmenter.ts#345-378) (lines 354-377) ✅ **O(log P + k)** - Efficient
- Uses binary search

### 4. [convertPageBreaks](file:///Users/rhaq/workspace/flappa-doormal/src/segmentation/segmenter.ts#379-411) (lines 393-410) ⚠️ **O(C)** - Could be optimized
- `Array.from(content)` creates full character array
- Consider using `replaceAll` with positions instead

### 5. [segmentPages](file:///Users/rhaq/workspace/flappa-doormal/src/segmentation/segmenter.ts#734-864) (lines 776-863) ⚠️ **O(R × M)** - Moderate
```
for each rule:          O(R)
  for each match:       O(M)
    push to splitPoints
```

### 6. [buildSegments](file:///Users/rhaq/workspace/flappa-doormal/src/segmentation/segmenter.ts#818-920) (lines 880-966) ✅ **O(S)** - Efficient
- Linear in split points

---

## 🔴 CRITICAL: [applyBreakpoints](file:///Users/rhaq/workspace/flappa-doormal/src/segmentation/segmenter.ts#412-733) (lines 426-732)

**Current Complexity: O(S × P × B × C)**

This is the most concerning function with multiple nested loops:

```
for each segment:                               O(S)
  while currentFromIdx <= toIdx:                O(P) per segment
    for each breakpoint pattern:                O(B)
      for pageIdx in remaining segment:         O(P) - exclude check
      for pageIdx in window:                    O(maxPages) - content length
      regex.matchAll(windowContent):            O(C)
      for pi in toIdx..currentFromIdx:          O(P) - find actual end
```

### Specific Issues:

#### 1. Repeated String Normalization - **O(P × C)**
Lines 622, 642, 699:
```typescript
pageData.content.replace(/\r\n?/g, '\n')
```
This is called **multiple times per page** in different loops.

**FIX**: Pre-normalize all page content once in a Map.

#### 2. Exclude Check Loop - **O(P) per breakpoint**
Lines 566-572:
```typescript
for (let pageIdx = currentFromIdx; pageIdx <= toIdx; pageIdx++) {
    if (isPageExcluded(pageIds[pageIdx], rule.exclude)) {
```
Called for **every breakpoint attempt**.

**FIX**: Pre-compute excluded pages as a Set.

#### 3. Window Content Length Calculation - **O(maxPages) per try**
Lines 637-648:
```typescript
for (let pageIdx = currentFromIdx; pageIdx <= windowEndIdx; pageIdx++) {
    windowEndPosition += pageData.content.replace(...).length;
```

**FIX**: Pre-compute cumulative offsets.

#### 4. `to` Field Search - **O(P) per piece**
Lines 695-712:
```typescript
for (let pi = toIdx; pi > currentFromIdx; pi--) {
    // indexOf search in pieceContent
```
String search in potentially large content.

---

## Optimization Recommendations

### Priority 1: Pre-compute Normalized Content (High Impact)

```typescript
// At start of applyBreakpoints:
const normalizedPages = new Map<number, { content: string; length: number }>();
for (const page of pages) {
    const normalized = page.content.replace(/\r\n?/g, '\n');
    normalizedPages.set(page.id, { content: normalized, length: normalized.length });
}
```

### Priority 2: Pre-compute Cumulative Offsets (High Impact)

```typescript
// Build cumulative offset array
const cumulativeOffsets: number[] = [0];
let total = 0;
for (let i = 0; i < pageIds.length; i++) {
    total += normalizedPages.get(pageIds[i])!.length + 1; // +1 for separator
    cumulativeOffsets.push(total);
}

// Then windowEndPosition becomes O(1):
const windowEndPosition = cumulativeOffsets[windowEndIdx + 1] - cumulativeOffsets[currentFromIdx];
```

### Priority 3: Convert Exclude List to Set

```typescript
// Per breakpoint rule:
const excludeSet = new Set<number>();
for (const item of rule.exclude || []) {
    if (typeof item === 'number') {
        excludeSet.add(item);
    } else {
        for (let i = item[0]; i <= item[1]; i++) excludeSet.add(i);
    }
}
// Then O(1) lookup instead of O(E)
```

### Priority 4: Early Exit Optimizations

- Cache [isInBreakpointRange](file:///Users/rhaq/workspace/flappa-doormal/src/segmentation/segmenter.ts#463-480) results per page
- Skip breakpoint patterns that don't apply to any page in range

---

## Estimated Impact

| Optimization | Before | After | Notes |
|-------------|--------|-------|-------|
| Normalize once | O(P×L) per segment | O(P×L) once | ~10x fewer string ops |
| Cumulative offsets | O(maxPages) per try | O(1) | Significant for large maxPages |
| Exclude Set | O(E) per check | O(1) | Minor but clean |
| **Overall** | O(S×P×B×C) | O(S×B×C) | Remove P factor from inner loop |

---

## Refactoring Suggestions

Consider extracting [applyBreakpoints](file:///Users/rhaq/workspace/flappa-doormal/src/segmentation/segmenter.ts#412-733) into a class:

```typescript
class BreakpointProcessor {
    private normalizedPages: Map<number, NormalizedPage>;
    private cumulativeOffsets: number[];
    private excludeSets: Map<BreakpointRule, Set<number>>;
    
    constructor(pages: Page[], breakpoints: Breakpoint[]) {
        this.precompute();
    }
    
    process(segments: Segment[]): Segment[] {
        // Use precomputed data
    }
}
```

This would:
1. Make the code more readable (reduce nesting)
2. Enable caching of expensive computations
3. Make testing easier

---

## Summary

**Main Issues:**
1. ⚠️ Repeated string normalization in loops
2. ⚠️ O(P) loops inside O(B) loops inside O(S) loops
3. ⚠️ No caching of computed values

**Quick Wins:**
1. Pre-normalize page content (single pass)
2. Pre-compute cumulative content offsets
3. Convert exclude lists to Sets

**Architectural Improvement:**
- Extract to a processor class for better code organization and caching
