# Memory & Garbage Collection Analysis for flappa-doormal

I'll analyze the code for potential GC pressure at scale (10k-20k pages). Here are the key findings:

## 🔴 Critical Issues (High GC Pressure)

### 1. **applyBreakpoints: Excessive String Slicing in Hot Loop**
**Location**: `segmenter.ts:690-850`

```typescript
while (currentFromIdx <= toIdx) {
    // Creates NEW string on every iteration
    remainingContent = remainingContent.slice(breakPosition).trim();
    
    // More string allocations
    const pieceContent = remainingContent.slice(0, breakPosition).trim();
}
```

**Impact**: For a 20k page book with many oversized segments, this loop could iterate thousands of times, creating a new string on each iteration.

**Estimated Garbage**: If processing 1000 oversized segments with avg 5 iterations each = **5000 temporary strings**

**Solution**:
```typescript
// Instead of slicing strings, track offsets into the original content
type ContentWindow = {
    content: string;  // Reference to original (no copy)
    start: number;    // Current position
    end: number;      // Window end
};

// Process by updating offsets, not creating new strings
window.start = breakPosition;  // No allocation!
```

### 2. **convertPageBreaks: Regex Replace Creates New Strings**
**Location**: `segmenter.ts:530-545`

```typescript
const convertPageBreaks = (content: string, startOffset: number, pageBreaks: number[]): string => {
    // Creates Set on EVERY segment
    const breakSet = new Set(breaksInRange);
    
    // Replace creates entirely new string
    return content.replace(/\n/g, (match, offset: number) => 
        (breakSet.has(offset) ? ' ' : match)
    );
};
```

**Impact**: Called for every multi-page segment. For 5000 segments spanning pages, creates 5000 new strings + 5000 Sets.

**Solution**:
```typescript
// Optimize: Only convert if breaks exist, use array iteration
if (breaksInRange.length === 0) return content;

// Build new string only once if needed
const chars: string[] = [];
let lastIdx = 0;
for (const breakIdx of breaksInRange) {
    chars.push(content.slice(lastIdx, breakIdx), ' ');
    lastIdx = breakIdx + 1;
}
chars.push(content.slice(lastIdx));
return chars.join('');
```

## 🟡 Moderate Issues (Unnecessary Allocations)

### 3. **findMatches: Many Small Objects**
**Location**: `segmenter.ts:422-445`

```typescript
while (m !== null) {
    const result: MatchResult = { 
        end: m.index + m[0].length, 
        start: m.index 
    };
    // Add captures conditionally...
    matches.push(result);
}
```

**Impact**: For a hadith book with 10k hadiths, creates **10k MatchResult objects**.

**Assessment**: This is probably **acceptable** - these objects are needed. However:

**Micro-optimization** (only if profiling shows this is hot):
```typescript
// Pre-allocate array if you can estimate size
const matches: MatchResult[] = new Array(estimatedSize);
let matchCount = 0;

// Or use object pooling for MatchResult objects
```

### 4. **Repeated Token Expansion**
**Location**: `segmenter.ts:190-200`

```typescript
// If multiple rules use same tokens, expansion happens multiple times
for (const rule of rules) {
    const { regex } = buildRuleRegex(rule);  // Expands tokens
}
```

**Impact**: Minimal unless hundreds of rules with complex tokens.

**Solution**: Already cached at module level for `TOKEN_PATTERNS`. ✅

## 🟢 Good Practices Already Implemented

### 5. **Pre-computed Cumulative Offsets** ✅
**Location**: `segmenter.ts:656-665`

```typescript
// OPTIMIZATION: Pre-compute cumulative offsets for O(1) window size calculation
const cumulativeOffsets: number[] = [0];
```

Excellent! This avoids O(n) calculations in hot loops.

### 6. **Pre-normalized Content Reuse** ✅
**Location**: `segmenter.ts:393, 835`

```typescript
const { normalizedPages: normalizedContent } = buildPageMap(pages);
// ...later reused without re-normalizing
applyBreakpoints(segments, pages, normalizedContent, ...);
```

Great optimization - avoids re-normalizing content.

### 7. **PageId to Index Map** ✅
**Location**: `segmenter.ts:637-638`

```typescript
const pageIdToIndex = new Map(pageIds.map((id, i) => [id, i]));
```

O(1) lookups instead of O(P) `indexOf`.

## 📊 Memory Profile Estimate (20k pages, 10k segments)

| Operation | Allocations | Estimated Memory |
|-----------|-------------|------------------|
| Page concatenation | 1 large string | ~50-100 MB (text) |
| Normalized pages Map | 20k entries | ~5 MB |
| MatchResult objects | ~10k objects | ~1 MB |
| **applyBreakpoints strings** | **5k-50k temps** | **10-50 MB GC churn** |
| **convertPageBreaks** | **5k strings + Sets** | **5-10 MB GC churn** |
| Cumulative offsets | 1 array (20k nums) | ~160 KB |
| Segments | ~10k objects | ~5 MB |

**Total GC Churn**: ~20-60 MB for temporary allocations that need collection.

## 🎯 Recommended Optimizations (Priority Order)

### **Priority 1: Refactor applyBreakpoints Loop**

Replace string slicing with offset tracking:

```typescript
// Current (creates many strings)
let remainingContent = segment.content;
while (...) {
    const pieceContent = remainingContent.slice(0, breakPosition).trim();
    remainingContent = remainingContent.slice(breakPosition).trim();
}

// Optimized (track offsets)
const fullContent = segment.content;
let currentOffset = 0;
while (...) {
    const pieceEnd = currentOffset + breakPosition;
    const pieceContent = fullContent.slice(currentOffset, pieceEnd).trim();
    currentOffset = pieceEnd;
    // Skip whitespace
    while (currentOffset < fullContent.length && 
           /\s/.test(fullContent[currentOffset])) {
        currentOffset++;
    }
}
```

**Savings**: Reduces allocations from 5k-50k to ~100-1000 (only final segment strings).

### **Priority 2: Optimize convertPageBreaks**

Only create new string if breaks exist:

```typescript
const convertPageBreaks = (content: string, startOffset: number, pageBreaks: number[]): string => {
    const breaksInRange = findBreaksInRange(startOffset, startOffset + content.length, pageBreaks);
    
    // Early exit - no allocations!
    if (breaksInRange.length === 0) return content;
    
    // Only allocate if necessary
    if (breaksInRange.length === 1) {
        const idx = breaksInRange[0];
        return content.slice(0, idx) + ' ' + content.slice(idx + 1);
    }
    
    // Multiple breaks - build once
    const parts: string[] = [];
    let lastIdx = 0;
    for (const breakIdx of breaksInRange) {
        if (breakIdx > lastIdx) {
            parts.push(content.slice(lastIdx, breakIdx));
        }
        parts.push(' ');
        lastIdx = breakIdx + 1;
    }
    if (lastIdx < content.length) {
        parts.push(content.slice(lastIdx));
    }
    return parts.join('');
};
```

**Savings**: Eliminates Set creation + early exits for common single-page case.

### **Priority 3: Add Memory-Efficient Mode** (Optional)

For truly massive books (50k+ pages), consider streaming:

```typescript
export type SegmentationOptions = {
    // ... existing options
    
    /**
     * Memory-efficient mode for very large books.
     * Processes in chunks to reduce peak memory usage.
     * Slightly slower but uses ~50% less memory.
     */
    streaming?: boolean;
};
```

## 🧪 Benchmark Recommendation

Add a memory profiling test:

```typescript
// perf-test.ts
const before = process.memoryUsage();
const segments = segmentPages(pages, options);
const after = process.memoryUsage();

console.log(`Heap used: ${(after.heapUsed - before.heapUsed) / 1024 / 1024} MB`);
console.log(`External: ${(after.external - before.external) / 1024 / 1024} MB`);
```

## Summary

**Current state**: Code is generally well-optimized with good pre-computations. Main issue is **string slicing in hot loops**.

**For 20k pages**: Should work but will generate 20-60 MB of garbage during processing.

**Quick wins**:
1. Refactor `applyBreakpoints` loop (Priority 1) - **Biggest impact**
2. Optimize `convertPageBreaks` early exit (Priority 2) - **Easy win**
3. Current code is otherwise solid for 10k-20k pages ✅

The optimizations are **not over-engineering** - they're targeted at real hot paths that will show measurable improvement at scale.