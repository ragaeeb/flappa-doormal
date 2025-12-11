# Review: `findActualStartPage` and `findActualEndPage` Functions

**Date:** 2025-12-11  
**Reviewer:** claude-4.5-opus-high  
**Files:** `src/segmentation/breakpoint-utils.ts` (lines 220-286)

## Overview

These functions determine which page a segment piece actually starts/ends on by searching for page content prefixes within concatenated content. They use substring matching with 30-character fingerprints.

## How They Work

### `findActualEndPage`

```typescript
for (let pi = toIdx; pi > currentFromIdx; pi--) {  // searches backwards
    const checkPortion = pageData.content.slice(0, Math.min(30, pageData.length));
    if (checkPortion.length > 0 && pieceContent.indexOf(checkPortion) > 0) {
        return pi;
    }
}
```

- Searches **backwards** from `toIdx` to `currentFromIdx`
- Takes first 30 characters of each page as fingerprint
- Returns first page whose fingerprint is found at position > 0

### `findActualStartPage`

```typescript
for (let pi = currentFromIdx; pi <= toIdx; pi++) {  // searches forwards
    const pagePrefix = pageData.content.slice(0, Math.min(30, pageData.length)).trim();
    if (trimmedPiece.startsWith(pagePrefix) || pageData.content.trimStart().startsWith(piecePrefix)) {
        return pi;
    }
}
```

- Searches **forwards** from `currentFromIdx` to `toIdx`
- Checks if piece starts with page prefix OR page starts with piece prefix
- Returns first matching page

---

## Safety Analysis

### The Duplicate Substring Problem

**Verdict: Potential correctness issue exists, but mitigated by search direction.**

#### Scenario Where It Could Fail

```
Page 1: "باب في الصلاة ... unique content A"
Page 2: "باب في الصلاة ... unique content B"  
Page 3: "باب في الصلاة ... unique content C"
```

If pages share the same 30-character prefix (common in Arabic texts with repeated chapter headers like `باب`, `بسم الله`, `حدثنا`):

- **`findActualEndPage`**: Searches backwards. If pages 2 and 3 both match, it returns page 3 (the first found from end). If the content actually ends on page 2, this is **incorrect**.

- **`findActualStartPage`**: Searches forwards. If pages 1 and 2 both match, it returns page 1 (the first found from start). If content actually starts on page 2, this is **incorrect**.

#### Why It Usually Works

1. **Search direction aligns with content order**: Pages appear sequentially in `pieceContent`, so the search direction (backwards for end, forwards for start) often finds the correct page first.

2. **The `indexOf > 0` guard**: `findActualEndPage` requires the match position to be > 0, which prevents matching the starting page at position 0.

3. **Limited search window**: Only pages within `[currentFromIdx, toIdx]` are searched, reducing collision probability.

#### When It Fails

- **Repeated formulaic openings** across consecutive pages (very common in Islamic hadith collections)
- **Short pages** where 30 characters may not be unique
- **Content that was split mid-page** by a breakpoint, then the remaining content starts with the same prefix as the next page

---

## Performance Analysis

### Time Complexity

| Function | Complexity | Notes |
|----------|------------|-------|
| `findActualEndPage` | O(p × c) | `indexOf` is O(c) worst case |
| `findActualStartPage` | O(p × 30) | `startsWith` is O(30) |

Where:
- `p` = pages in window (typically ≤ `maxPages`, often 2-10)
- `c` = length of `pieceContent` (could be 10K+ characters)

### Concrete Numbers

For a typical call with `maxPages: 5` and 2KB per page:

| Function | Operations |
|----------|-----------|
| `findActualEndPage` | 5 × 10,000 = 50K char comparisons |
| `findActualStartPage` | 5 × 30 = 150 char comparisons |

### Is This Performant?

**Yes, acceptable for typical usage.**

- Functions only called when segments exceed `maxPages`
- For a 500-page book with ~50 splits: ~2.5M total char comparisons
- This completes in milliseconds on modern hardware

**Potential concern**: If nearly every segment needs splitting (misconfigured rules), cost multiplies significantly.

---

## Recommendations

### 1. Increase Fingerprint Length (Low Effort, High Impact)

Increase from 30 to 80 characters to dramatically reduce collision probability:

```typescript
const FINGERPRINT_LENGTH = 80;
const checkPortion = pageData.content.slice(0, Math.min(FINGERPRINT_LENGTH, pageData.length));
```

**Rationale**: 30 characters in Arabic is approximately 5-8 words. Common phrases like "بسم الله الرحمن الرحيم" are 24 characters. 80 characters provides much better uniqueness while still being fast.

### 2. Add Position Validation (Medium Effort, High Safety)

Validate that matches occur at expected positions using cumulative offsets:

```typescript
export const findActualEndPage = (
    pieceContent: string,
    currentFromIdx: number,
    toIdx: number,
    pageIds: number[],
    normalizedPages: Map<number, NormalizedPage>,
    cumulativeOffsets: number[], // NEW PARAMETER
): number => {
    const baseOffset = cumulativeOffsets[currentFromIdx];
    
    for (let pi = toIdx; pi > currentFromIdx; pi--) {
        const pageData = normalizedPages.get(pageIds[pi]);
        if (pageData) {
            const checkPortion = pageData.content.slice(0, Math.min(80, pageData.length));
            if (checkPortion.length === 0) continue;
            
            const actualPos = pieceContent.indexOf(checkPortion);
            const expectedPos = cumulativeOffsets[pi] - baseOffset;
            
            // Allow tolerance for whitespace trimming differences
            if (actualPos > 0 && Math.abs(actualPos - expectedPos) < 50) {
                return pi;
            }
        }
    }
    return currentFromIdx;
};
```

**Rationale**: Position validation ensures the match is at the geometrically correct location, not just somewhere in the content.

### 3. Document the Limitation (Minimal Effort)

Add a JSDoc warning about the collision possibility:

```typescript
/**
 * ...existing docs...
 * 
 * @remarks
 * This function uses prefix matching and may return incorrect results if multiple
 * pages in the search window share the same 30-character prefix. This is rare in
 * well-structured texts but can occur with repeated formulaic openings (e.g., 
 * "بسم الله", "باب", "حدثنا"). Consider increasing fingerprint length if this
 * causes incorrect page attribution in your corpus.
 */
```

### 4. Consider Fallback to Offset-Based Calculation

If no unique prefix is found, fall back to cumulative offset calculation (already available in the codebase):

```typescript
// If no match found by content, use offset-based estimation
const estimatedEndIdx = findPageIndexByOffset(breakPosition, cumulativeOffsets, currentFromIdx, toIdx);
return estimatedEndIdx;
```

---

## Risk Assessment

| Issue | Severity | Likelihood | Recommended Action |
|-------|----------|------------|-------------------|
| Wrong page attribution | Medium | Medium | Increase fingerprint to 80 chars |
| Performance degradation | Low | Low | No action needed |
| Silent incorrect results | Medium | Medium | Add position validation |

---

## Conclusion

The current implementation works for most cases but has a **correctness edge case** with repeated content prefixes. This is particularly relevant for Arabic religious texts where formulaic phrases (`بسم الله`, `باب`, `حدثنا`) commonly appear at page boundaries.

**Recommended priority:**
1. **Quick win**: Increase fingerprint from 30 → 80 characters
2. **Robust fix**: Add position validation using cumulative offsets
3. **Documentation**: Add JSDoc warnings about the limitation

The performance is acceptable and not a concern for typical book-scale inputs.

---

*Reviewed by: claude-4.5-opus-high*
