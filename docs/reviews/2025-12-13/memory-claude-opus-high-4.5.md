# Memory Analysis: Garbage Production and GC Impact

**Date:** 2025-12-13  
**Reviewer:** claude-opus-high-4.5  
**Files Analyzed:**
- `src/segmentation/segmenter.ts`
- `src/segmentation/breakpoint-utils.ts`
- `src/segmentation/match-utils.ts`
- `src/segmentation/tokens.ts`

---

## Executive Summary

The codebase has several areas that produce garbage, but most are **unavoidable** given the algorithm's requirements. A few optimizations could reduce GC pressure for large inputs, but overall the code is reasonably well-optimized for its use case.

---

## Major Garbage Producers

### 1. Content Concatenation (HIGH Impact)

**Location:** `segmenter.ts` line 296 (`buildPageMap`)

```typescript
content: parts.join('\n')
```

**Analysis:**
- Creates a single large string from all page content
- For a 1,000-page book with 5KB/page = ~5MB allocation
- For a 10,000-page book = ~50MB allocation

**Status:** ⚠️ **Unavoidable** - Required for cross-page pattern matching. The algorithm needs to find patterns that span page boundaries.

**Mitigation already in place:** The `normalizedPages` array is reused to avoid re-normalizing content later.

---

### 2. Per-Match Object Allocation (HIGH Impact)

**Location:** `segmenter.ts` lines 338-361 (`findMatches`)

```typescript
while (m !== null) {
    const result: MatchResult = { end: m.index + m[0].length, start: m.index };
    result.namedCaptures = extractNamedCaptures(m.groups, captureNames);
    if (usesCapture) {
        result.captured = getLastPositionalCapture(m);
    }
    matches.push(result);
    // ...
}
```

**Analysis:**
- Creates a new `MatchResult` object for EVERY regex match
- Content-rich books can have thousands of matches
- Each object has 2-4 properties

**GC Impact by scale:**
| Matches | Object Allocations | Approx. Memory |
|---------|-------------------|----------------|
| 1,000 | 1,000 | ~80 KB |
| 10,000 | 10,000 | ~800 KB |
| 100,000 | 100,000 | ~8 MB |

**Status:** ⚠️ **Acceptable trade-off** - Switching to a streaming approach would significantly complicate the code. The current approach prioritizes clarity.

---

### 3. Set Creation in `convertPageBreaks` (MEDIUM Impact)

**Location:** `segmenter.ts` lines 412-427

```typescript
const convertPageBreaks = (content: string, startOffset: number, pageBreaks: number[]): string => {
    const endOffset = startOffset + content.length;
    const breaksInRange = findBreaksInRange(startOffset, endOffset, pageBreaks);

    if (breaksInRange.length === 0) {
        return content;  // Early return - good!
    }

    const breakSet = new Set(breaksInRange);  // Set created for each segment with breaks
    return content.replace(/\n/g, (match, offset: number) => (breakSet.has(offset) ? ' ' : match));
};
```

**Analysis:**
- Creates a `Set` for every segment that spans multiple pages
- Most segments are single-page, so this is often skipped
- The early return is good optimization

**Status:** ✅ **Acceptable** - Set creation only happens for multi-page segments.

---

### 4. Data Structure Creation in `applyBreakpoints` (MEDIUM Impact)

**Location:** `segmenter.ts` lines 478-505

```typescript
const pageIds = pages.map((p) => p.id);
const pageIdToIndex = new Map(pageIds.map((id, i) => [id, i]));
const normalizedPages = new Map<number, NormalizedPage>();
// ... loop to populate normalizedPages
const cumulativeOffsets: number[] = [0];
// ... loop to populate cumulativeOffsets
const expandedBreakpoints = expandBreakpoints(breakpoints, patternProcessor);
```

**Analysis:**
- Creates multiple data structures: 2 Maps, 2 Arrays
- Only created once per `applyBreakpoints` call
- Structures are reused throughout the function

**Status:** ✅ **Acceptable** - O(P) where P = pages, and enables O(1) lookups later.

---

### 5. `.map()` Chains in `buildRuleRegex` (LOW Impact)

**Location:** `segmenter.ts` lines 152-154, 166-168, 172-174

```typescript
const processed = s.lineStartsAfter.map((p) => processPattern(p, fuzzy));
const patterns = processed.map((p) => p.pattern).join('|');
allCaptureNames = processed.flatMap((p) => p.captureNames);
```

**Analysis:**
- Creates intermediate arrays for each pattern type
- Only runs once per rule during initialization
- Rules are typically few (< 10)

**Status:** ✅ **Negligible** - Initialization-time only, small arrays.

---

### 6. Match Collection in `findPatternBreakPosition` (MEDIUM Impact)

**Location:** `breakpoint-utils.ts` lines 348-362

```typescript
export const findPatternBreakPosition = (
    windowContent: string,
    regex: RegExp,
    prefer: 'longer' | 'shorter',
): number => {
    const matches: { index: number; length: number }[] = [];
    for (const m of windowContent.matchAll(regex)) {
        matches.push({ index: m.index, length: m[0].length });
    }
    if (matches.length === 0) {
        return -1;
    }
    const selected = prefer === 'longer' ? matches[matches.length - 1] : matches[0];
    return selected.index + selected.length;
};
```

**Analysis:**
- Collects ALL matches into an array just to pick first or last
- For `prefer: 'shorter'`, only first match is needed
- For `prefer: 'longer'`, only last match is needed

**Potential Optimization:**

```typescript
export const findPatternBreakPosition = (
    windowContent: string,
    regex: RegExp,
    prefer: 'longer' | 'shorter',
): number => {
    regex.lastIndex = 0;
    
    // For 'shorter', return immediately on first match
    if (prefer === 'shorter') {
        const m = regex.exec(windowContent);
        return m ? m.index + m[0].length : -1;
    }
    
    // For 'longer', iterate but only keep last match (no array)
    let lastIndex = -1;
    let lastLength = 0;
    for (const m of windowContent.matchAll(regex)) {
        lastIndex = m.index;
        lastLength = m[0].length;
    }
    return lastIndex >= 0 ? lastIndex + lastLength : -1;
};
```

**Status:** 🔧 **Optimization opportunity** - Could avoid array allocation entirely.

---

### 7. `buildExcludeSet` Range Expansion (POTENTIALLY HIGH Impact)

**Location:** `breakpoint-utils.ts` lines 104-116

```typescript
export const buildExcludeSet = (excludeList: PageRange[] | undefined): Set<number> => {
    const excludeSet = new Set<number>();
    for (const item of excludeList || []) {
        if (typeof item === 'number') {
            excludeSet.add(item);
        } else {
            for (let i = item[0]; i <= item[1]; i++) {
                excludeSet.add(i);
            }
        }
    }
    return excludeSet;
};
```

**Analysis:**
- Expands ranges into explicit page IDs
- `exclude: [[1, 10000]]` creates 10,000 Set entries
- Already documented in JSDoc as a concern

**Status:** ⚠️ **Known limitation** - Acceptable for typical use (small exclude lists).

---

## Memory-Efficient Patterns Already Used ✅

The codebase already employs several good memory practices:

1. **Binary search** in `findBoundary()` and `findBreaksInRange()` - O(log n) lookup
2. **Pre-computed `cumulativeOffsets`** - Avoids repeated offset calculations
3. **`pageIdToIndex` Map** - O(1) page index lookups instead of O(P) `indexOf`
4. **Reusing `normalizedContent`** from `buildPageMap` - Avoids re-normalizing pages
5. **Early returns** - `convertPageBreaks` returns early when no breaks in range

---

## GC Impact Estimates by Input Size

| Pages | Content Size | Match Objects | Total Allocations | Expected GC Pauses |
|-------|-------------|---------------|-------------------|-------------------|
| 100 | ~500 KB | ~500 | ~2,000 | Negligible |
| 1,000 | ~5 MB | ~5,000 | ~20,000 | Minor (<10ms) |
| 5,000 | ~25 MB | ~25,000 | ~100,000 | Noticeable (~50ms) |
| 10,000 | ~50 MB | ~50,000 | ~200,000 | Significant (~100ms) |
| 50,000 | ~250 MB | ~250,000 | ~1,000,000 | Major (multi-second) |

---

## Recommendations

### Immediate (Low Effort)

| Priority | Location | Change | Impact |
|----------|----------|--------|--------|
| 🟢 LOW | `findPatternBreakPosition` | Avoid array for first/last match | Minor GC reduction |

### Future Consideration (High Effort)

| Priority | Location | Change | Impact |
|----------|----------|--------|--------|
| 🟡 MEDIUM | `findMatches` | Object pooling or streaming | Significant for large inputs |
| 🟡 MEDIUM | Algorithm | Chunked processing for huge books | Memory ceiling reduction |

### Not Recommended

| Location | Why Not |
|----------|---------|
| Content concatenation | Unavoidable for cross-page matching |
| Per-rule `.map()` chains | Runs once at init, negligible impact |

---

## Conclusion

The codebase is **well-optimized for its intended use case** (book-scale text processing up to ~10,000 pages). The main garbage producers are:

1. **Unavoidable**: Concatenated content string
2. **Acceptable**: Per-match object allocations (clarity over micro-optimization)
3. **Optimizable**: `findPatternBreakPosition` array collection

For typical usage (< 10,000 pages), GC impact should be minimal. For very large inputs:
- Increase Node.js heap size (`--max-old-space-size`)
- Consider processing in smaller chunks if architecture allows

---

*Reviewed by: claude-opus-high-4.5*

