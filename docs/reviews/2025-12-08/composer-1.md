# Code Review: flappa-doormal

**Reviewer**: Composer-1
**Date**: 2025-12-08  
**Scope**: Full codebase review focusing on critical issues, performance concerns, and code quality improvements

---

## Executive Summary

The codebase is well-structured with good separation of concerns and comprehensive documentation. However, there are several **critical performance issues** that will become bottlenecks when processing tens of thousands of pages, along with some assumptions that could lead to incorrect behavior in edge cases.

**Priority Issues:**
1. ⚠️ **CRITICAL**: `convertPageBreaks` creates multiple string copies (O(n²) complexity)
2. ⚠️ **HIGH**: No error handling for invalid regex patterns
3. ⚠️ **HIGH**: `groupBySpanAndFilter` makes incorrect assumptions about page ID distribution
4. ⚠️ **MEDIUM**: Memory concerns for very large datasets (50k+ pages)
5. ⚠️ **MEDIUM**: `findBoundary` fallback behavior may be incorrect

---

## Critical Issues

### 1. `convertPageBreaks` String Mutation Inefficiency

**Location**: `src/segmentation/segmenter.ts:338-362`

**Problem**: The function creates a new string for each page break using `slice()` operations:

```338:362:src/segmentation/segmenter.ts
const convertPageBreaks = (content: string, startOffset: number, pageBreaks: Set<number>): string => {
    // Fast path: check if any page breaks fall within this segment's range
    const endOffset = startOffset + content.length;
    const breaksInRange: number[] = [];

    for (const pb of pageBreaks) {
        if (pb >= startOffset && pb < endOffset) {
            breaksInRange.push(pb - startOffset);
        }
    }

    // No page breaks in this segment - return as-is (most common case)
    if (breaksInRange.length === 0) {
        return content;
    }

    // Convert page-break newlines to spaces
    let result = content;
    for (const idx of breaksInRange) {
        if (result[idx] === '\n') {
            result = `${result.slice(0, idx)} ${result.slice(idx + 1)}`;
        }
    }
    return result;
};
```

**Impact**: For segments spanning many pages, this creates O(n) string copies, each requiring O(m) time where m is the content length. Total complexity: **O(n × m)**.

**Recommendation**: Use a single-pass array-based approach:

```typescript
const convertPageBreaks = (content: string, startOffset: number, pageBreaks: Set<number>): string => {
    const endOffset = startOffset + content.length;
    const breaksInRange: number[] = [];

    for (const pb of pageBreaks) {
        if (pb >= startOffset && pb < endOffset) {
            breaksInRange.push(pb - startOffset);
        }
    }

    if (breaksInRange.length === 0) {
        return content;
    }

    // Single pass: build array of characters, then join
    const chars = Array.from(content);
    for (const idx of breaksInRange) {
        if (chars[idx] === '\n') {
            chars[idx] = ' ';
        }
    }
    return chars.join('');
};
```

**Performance Impact**: Reduces from O(n × m) to O(n + m) for segments with page breaks.

---

### 2. No Error Handling for Invalid Regex Patterns

**Location**: `src/segmentation/segmenter.ts:120-173` (`buildRuleRegex`)

**Problem**: If a user provides an invalid regex pattern (either directly via `regex` field or via token expansion), `new RegExp()` will throw an unhandled exception:

```141:141:src/segmentation/segmenter.ts
            regex: new RegExp(s.regex, 'gmu'),
```

**Impact**: The entire segmentation process crashes with an unhelpful error message.

**Recommendation**: Wrap regex compilation in try-catch and provide helpful error messages:

```typescript
const buildRuleRegex = (rule: SplitRule): RuleRegex => {
    // ... existing code ...
    
    try {
        return {
            captureNames: allCaptureNames,
            regex: new RegExp(s.regex!, 'gmu'),
            usesCapture,
            usesLineStartsAfter: false,
        };
    } catch (error) {
        throw new Error(
            `Invalid regex pattern in rule: ${s.regex}. ` +
            `Original error: ${error instanceof Error ? error.message : String(error)}`
        );
    }
};
```

**Alternative**: Consider validating patterns upfront or providing a `validateRules()` function.

---

### 3. `groupBySpanAndFilter` Page ID Assumption

**Location**: `src/segmentation/match-utils.ts:241-263`

**Problem**: The function uses `Math.floor(id / maxSpan)` to group pages, which assumes page IDs are sequential starting from a low number:

```241:263:src/segmentation/match-utils.ts
export const groupBySpanAndFilter = (
    matches: MatchResult[],
    maxSpan: number,
    occurrence: 'first' | 'last' | 'all' | undefined,
    getId: (offset: number) => number,
): MatchResult[] => {
    const matchesByGroup = new Map<number, MatchResult[]>();

    for (const m of matches) {
        const id = getId(m.start);
        const groupKey = Math.floor(id / maxSpan);
        if (!matchesByGroup.has(groupKey)) {
            matchesByGroup.set(groupKey, []);
        }
        matchesByGroup.get(groupKey)!.push(m);
    }

    const result: MatchResult[] = [];
    for (const groupMatches of matchesByGroup.values()) {
        result.push(...filterByOccurrence(groupMatches, occurrence));
    }
    return result;
};
```

**Example Issue**: If page IDs are `[1000, 1001, 1002, 1003]` and `maxSpan: 2`:
- Current behavior: Groups as `[1000, 1001]` and `[1002, 1003]` ✅ (correct)
- But if IDs are `[1, 2, 1000, 1001]`:
  - Groups as `[1, 2]` and `[1000, 1001]` ✅ (correct by current logic)
  - However, the intent might be to group consecutive pages, not pages by ID ranges

**Impact**: The behavior is actually **correct** for the current design (grouping by ID ranges), but the documentation should clarify this. However, if the intent is to group **consecutive pages** (not ID ranges), this is wrong.

**Recommendation**: 
1. Clarify in documentation whether `maxSpan` groups by ID ranges or consecutive pages
2. If grouping consecutive pages is desired, track page boundaries and group accordingly
3. Add a test case with non-sequential page IDs to document expected behavior

---

### 4. `findBoundary` Fallback Behavior

**Location**: `src/segmentation/segmenter.ts:249-266`

**Problem**: When an offset is not found in any boundary, the function returns the last boundary:

```249:266:src/segmentation/segmenter.ts
    const findBoundary = (off: number): PageBoundary | undefined => {
        let lo = 0;
        let hi = boundaries.length - 1;

        while (lo <= hi) {
            const mid = (lo + hi) >>> 1; // Unsigned right shift for floor division
            const b = boundaries[mid];
            if (off < b.start) {
                hi = mid - 1;
            } else if (off > b.end) {
                lo = mid + 1;
            } else {
                return b;
            }
        }
        // Fallback to last boundary if not found
        return boundaries[boundaries.length - 1];
    };
```

**Impact**: If an offset is **beyond** the last page (e.g., due to a bug or edge case), it incorrectly returns the last page instead of `undefined` or throwing an error.

**Recommendation**: Return `undefined` or throw an error for out-of-bounds offsets:

```typescript
const findBoundary = (off: number): PageBoundary | undefined => {
    let lo = 0;
    let hi = boundaries.length - 1;

    while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        const b = boundaries[mid];
        if (off < b.start) {
            hi = mid - 1;
        } else if (off > b.end) {
            lo = mid + 1;
        } else {
            return b;
        }
    }
    // Out of bounds - return undefined
    return undefined;
};
```

Then handle `undefined` in `getId`:

```typescript
getId: (off: number) => {
    const boundary = findBoundary(off);
    if (!boundary) {
        // Could throw or return a sentinel value
        throw new Error(`Offset ${off} is out of bounds`);
    }
    return boundary.id;
}
```

---

### 5. Type Safety: Non-null Assertion

**Location**: `src/segmentation/segmenter.ts:169`

**Problem**: Uses non-null assertion `s.regex!` which could fail at runtime:

```166:172:src/segmentation/segmenter.ts
    const usesCapture = hasCapturingGroup(s.regex!) || allCaptureNames.length > 0;
    return {
        captureNames: allCaptureNames,
        regex: new RegExp(s.regex!, 'gmu'),
        usesCapture,
        usesLineStartsAfter: false,
    };
```

**Impact**: If `s.regex` is `undefined` (shouldn't happen, but TypeScript can't prove it), this will throw a runtime error.

**Recommendation**: Add explicit check or restructure to ensure `s.regex` is always defined at this point:

```typescript
if (!s.regex) {
    throw new Error('Rule must specify exactly one pattern type (regex, template, lineStartsWith, lineStartsAfter, or lineEndsWith)');
}
const usesCapture = hasCapturingGroup(s.regex) || allCaptureNames.length > 0;
return {
    captureNames: allCaptureNames,
    regex: new RegExp(s.regex, 'gmu'),
    usesCapture,
    usesLineStartsAfter: false,
};
```

---

## Performance Concerns for Large Datasets

### 1. Memory: Full Content Concatenation

**Location**: `src/segmentation/segmenter.ts:224-272` (`buildPageMap`)

**Problem**: For 50,000 pages of 1KB each, this creates a single 50MB+ string in memory:

```224:272:src/segmentation/segmenter.ts
const buildPageMap = (pages: Page[]): { content: string; pageMap: PageMap } => {
    const boundaries: PageBoundary[] = [];
    const pageBreaks = new Set<number>();
    let offset = 0;
    const parts: string[] = [];

    for (let i = 0; i < pages.length; i++) {
        const normalized = normalizeLineEndings(pages[i].content);
        boundaries.push({ end: offset + normalized.length, id: pages[i].id, start: offset });
        parts.push(normalized);
        if (i < pages.length - 1) {
            pageBreaks.add(offset + normalized.length);
            offset += normalized.length + 1;
        } else {
            offset += normalized.length;
        }
    }

    /**
     * Finds the page boundary containing the given offset using binary search.
     * O(log n) complexity for efficient lookup with many pages.
     *
     * @param off - Character offset to look up
     * @returns Page boundary or the last boundary as fallback
     */
    const findBoundary = (off: number): PageBoundary | undefined => {
        let lo = 0;
        let hi = boundaries.length - 1;

        while (lo <= hi) {
            const mid = (lo + hi) >>> 1; // Unsigned right shift for floor division
            const b = boundaries[mid];
            if (off < b.start) {
                hi = mid - 1;
            } else if (off > b.end) {
                lo = mid + 1;
            } else {
                return b;
            }
        }
        // Fallback to last boundary if not found
        return boundaries[boundaries.length - 1];
    };

    return {
        content: parts.join('\n'),
        pageMap: { boundaries, getId: (off: number) => findBoundary(off)?.id ?? 0, pageBreaks },
    };
};
```

**Impact**: 
- **Memory**: 50MB+ string allocation (acceptable for most systems, but could be problematic for constrained environments)
- **Time**: `parts.join('\n')` is O(n) where n is total content length (acceptable)

**Recommendation**: 
- Current approach is reasonable for most use cases
- Consider streaming/chunked processing for datasets >100MB if memory becomes an issue
- Document memory requirements in README

**Verdict**: ⚠️ **Acceptable for now**, but worth monitoring for very large datasets.

---

### 2. Regex Execution on Large Strings

**Location**: `src/segmentation/segmenter.ts:297-322` (`findMatches`)

**Problem**: Executes regex with global flag against entire concatenated content:

```297:322:src/segmentation/segmenter.ts
const findMatches = (content: string, regex: RegExp, usesCapture: boolean, captureNames: string[]): MatchResult[] => {
    const matches: MatchResult[] = [];
    regex.lastIndex = 0;
    let m = regex.exec(content);

    while (m !== null) {
        const result: MatchResult = { end: m.index + m[0].length, start: m.index };

        // Extract named captures if present
        result.namedCaptures = extractNamedCaptures(m.groups, captureNames);

        // For lineStartsAfter, get the last positional capture (the .* content)
        if (usesCapture) {
            result.captured = getLastPositionalCapture(m);
        }

        matches.push(result);

        if (m[0].length === 0) {
            regex.lastIndex++;
        }
        m = regex.exec(content);
    }

    return matches;
};
```

**Impact**: 
- For 50MB content, regex execution could be slow depending on pattern complexity
- Global regex with complex patterns (especially fuzzy patterns) can be expensive
- Each rule executes regex against full content

**Recommendation**:
- Current approach is standard and acceptable
- Consider early termination if `occurrence: 'first'` is set (stop after first match)
- Profile with real-world patterns to identify bottlenecks
- Consider regex optimization flags or pattern simplification for common cases

**Verdict**: ⚠️ **Acceptable**, but worth profiling with real data.

---

### 3. `convertPageBreaks` Iteration Over All Page Breaks

**Location**: `src/segmentation/segmenter.ts:338-362`

**Problem**: For each segment, iterates through **all** page breaks to find ones in range:

```343:347:src/segmentation/segmenter.ts
    for (const pb of pageBreaks) {
        if (pb >= startOffset && pb < endOffset) {
            breaksInRange.push(pb - startOffset);
        }
    }
```

**Impact**: For 50k pages, this is O(50k) per segment. If there are many segments, this becomes expensive.

**Recommendation**: Use a sorted array + binary search instead of a Set:

```typescript
// In buildPageMap, store as sorted array instead of Set
const pageBreaksArray = Array.from(pageBreaks).sort((a, b) => a - b);

// In convertPageBreaks, use binary search to find range
const findBreaksInRange = (start: number, end: number, breaks: number[]): number[] => {
    const result: number[] = [];
    // Binary search for first break >= start
    let lo = 0;
    let hi = breaks.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (breaks[mid] < start) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    // Iterate from lo until breaks exceed end
    for (let i = lo; i < breaks.length && breaks[i] < end; i++) {
        result.push(breaks[i] - startOffset);
    }
    return result;
};
```

**Performance Impact**: Reduces from O(n) to O(log n + k) where k is breaks in range.

**Verdict**: ⚠️ **Worth optimizing** for large datasets.

---

### 4. Regex Compilation Per Call

**Location**: `src/segmentation/segmenter.ts:415-416`

**Problem**: Each call to `segmentPages` recompiles regex patterns:

```415:416:src/segmentation/segmenter.ts
    for (const rule of rules) {
        const { regex, usesCapture, captureNames } = buildRuleRegex(rule);
```

**Impact**: If `segmentPages` is called multiple times with the same rules, regexes are recompiled unnecessarily.

**Recommendation**: 
- Current approach is fine for single-use cases
- Consider caching compiled regexes if rules are reused frequently
- Could add a `RuleCompiler` class that caches compiled regexes

**Verdict**: ✅ **Acceptable** - optimization only needed if rules are reused.

---

## Code Quality Improvements

### 1. `buildRuleRegex` Complexity

**Location**: `src/segmentation/segmenter.ts:120-173`

**Problem**: Function handles multiple pattern types with nested conditionals, making it hard to follow.

**Recommendation**: Extract pattern-specific logic into separate functions:

```typescript
const buildLineStartsAfterRegex = (patterns: string[], fuzzy: boolean): RuleRegex => {
    const processed = patterns.map((p) => processPattern(p, fuzzy));
    const patternStr = processed.map((p) => p.pattern).join('|');
    const captureNames = processed.flatMap((p) => p.captureNames);
    return {
        captureNames,
        regex: new RegExp(`^(?:${patternStr})(.*)`, 'gmu'),
        usesCapture: true,
        usesLineStartsAfter: true,
    };
};

const buildRuleRegex = (rule: SplitRule): RuleRegex => {
    const fuzzy = rule.fuzzy ?? false;
    
    if (rule.lineStartsAfter?.length) {
        return buildLineStartsAfterRegex(rule.lineStartsAfter, fuzzy);
    }
    // ... etc
};
```

**Verdict**: ⚠️ **Nice to have** - improves maintainability.

---

### 2. Missing Validation: Exactly One Pattern Type

**Problem**: TypeScript types don't enforce that rules have exactly one pattern type. A rule could theoretically have multiple (though TypeScript's union types help).

**Recommendation**: Add runtime validation:

```typescript
const buildRuleRegex = (rule: SplitRule): RuleRegex => {
    const patternTypes = [
        rule.regex !== undefined,
        rule.template !== undefined,
        rule.lineStartsWith !== undefined,
        rule.lineStartsAfter !== undefined,
        rule.lineEndsWith !== undefined,
    ].filter(Boolean).length;
    
    if (patternTypes !== 1) {
        throw new Error('Rule must specify exactly one pattern type');
    }
    // ... rest of function
};
```

**Verdict**: ⚠️ **Defensive programming** - catches bugs early.

---

### 3. `hasCapturingGroup` May Miss Edge Cases

**Location**: `src/segmentation/segmenter.ts:52-55`

**Problem**: The regex `/(?!\?)/` might not catch all edge cases:

```52:55:src/segmentation/segmenter.ts
const hasCapturingGroup = (pattern: string): boolean => {
    // Match ( that is NOT followed by ? (excludes non-capturing and named groups)
    return /\((?!\?)/.test(pattern);
};
```

**Edge Cases**:
- `\(` (escaped parenthesis) - correctly excluded
- `(?<name>...)` (named groups) - correctly excluded
- `(?:...)` (non-capturing) - correctly excluded
- But what about `(?=...)` (lookahead) - correctly excluded
- `(?<=...)` (lookbehind) - correctly excluded

**Verdict**: ✅ **Actually correct** - the regex properly excludes all non-capturing variants.

---

### 4. Documentation: `maxSpan` Behavior

**Problem**: Documentation doesn't clearly explain that `maxSpan` groups by **ID ranges**, not consecutive pages.

**Recommendation**: Clarify in `types.ts`:

```typescript
/**
 * Maximum number of pages a segment can span before forcing a split.
 *
 * When set, occurrence filtering is applied per page-group:
 * - `maxSpan: 1` = per-page (e.g., last punctuation on EACH page)
 * - `maxSpan: 2` = at most 2 pages per group (pages 0-1, 2-3, 4-5, etc.)
 * - `undefined` = no limit (entire content treated as one group)
 *
 * **Note**: Grouping is based on page ID ranges using `Math.floor(pageId / maxSpan)`.
 * This means pages with IDs [1000, 1001, 1002, 1003] and `maxSpan: 2` will be
 * grouped as [1000, 1001] and [1002, 1003], even if they are not consecutive
 * in the input array.
 *
 * @example
 * // Split at last period on each page
 * { lineEndsWith: ['.'], split: 'after', occurrence: 'last', maxSpan: 1 }
 */
maxSpan?: number;
```

**Verdict**: ⚠️ **Documentation improvement** - clarifies behavior.

---

## Assumptions & Edge Cases

### 1. Page IDs Are Numeric and Reasonable

**Assumption**: Page IDs are numbers that can be divided and compared.

**Edge Case**: What if page IDs are negative? `Math.floor(-1 / 2) = -1`, which might group incorrectly.

**Recommendation**: Document that page IDs should be non-negative, or handle negative IDs explicitly.

---

### 2. Content Fits in Memory

**Assumption**: All pages can be concatenated into a single string.

**Edge Case**: Very large datasets (>100MB) might cause memory issues.

**Recommendation**: Document memory requirements and consider streaming for future versions.

---

### 3. Regex Patterns Are Valid

**Assumption**: Users provide valid regex patterns.

**Edge Case**: Invalid patterns crash the process.

**Recommendation**: Add error handling (see Critical Issue #2).

---

### 4. Page Breaks Are Single Newlines

**Assumption**: Page breaks are represented as single `\n` characters.

**Edge Case**: What if content contains `\n\n` (double newlines)? They would be converted to spaces incorrectly.

**Recommendation**: Document this behavior or consider more sophisticated page break detection.

---

### 5. Empty Matches Are Handled

**Current Behavior**: Zero-length matches are handled correctly with `regex.lastIndex++`:

```315:317:src/segmentation/segmenter.ts
        if (m[0].length === 0) {
            regex.lastIndex++;
        }
```

**Verdict**: ✅ **Correctly handled**.

---

## Recommendations Summary

### Must Fix (Critical)
1. ✅ Fix `convertPageBreaks` string mutation inefficiency
2. ✅ Add error handling for invalid regex patterns
3. ✅ Fix `findBoundary` fallback behavior
4. ✅ Remove non-null assertion and add validation

### Should Fix (High Priority)
1. ⚠️ Optimize `convertPageBreaks` page break lookup (sorted array + binary search)
2. ⚠️ Clarify `maxSpan` grouping behavior in documentation
3. ⚠️ Add validation for exactly one pattern type per rule

### Nice to Have (Medium Priority)
1. 💡 Refactor `buildRuleRegex` for better maintainability
2. 💡 Consider regex compilation caching if rules are reused
3. 💡 Document memory requirements for large datasets
4. 💡 Add tests for edge cases (negative page IDs, out-of-bounds offsets)

### Performance Monitoring
1. 📊 Profile regex execution with real-world patterns
2. 📊 Monitor memory usage with 50k+ pages
3. 📊 Consider early termination for `occurrence: 'first'` in regex matching

---

## Conclusion

The codebase is well-architected with good separation of concerns and comprehensive documentation. The main concerns are:

1. **Performance**: `convertPageBreaks` will be a bottleneck for large datasets
2. **Robustness**: Missing error handling could cause crashes
3. **Edge Cases**: Some assumptions about page IDs and boundaries need clarification

With the recommended fixes, the library should handle tens of thousands of pages efficiently while being more robust to edge cases and user errors.

