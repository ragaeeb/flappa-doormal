# Replace maxSpan with Breakpoints Feature

## Summary
Replace the complex `maxSpan` sliding window logic with a simpler `breakpoints` post-processing approach inspired by LangChain's RecursiveCharacterTextSplitter.

## New API Design

```typescript
interface SegmentationOptions {
  rules?: SplitRule[];
  maxPages?: number;              // Max pages per segment before breakpoints apply
  breakpoints?: string[];         // Patterns to try in order (tokens supported)
  prefer?: 'longer' | 'shorter';  // Match selection preference
}
```

### Example Usage
```json
{
  "rules": [
    { "lineStartsWith": ["{{fasl}}"], "split": "at" }
  ],
  "maxPages": 2,
  "breakpoints": ["{{tarqim}}\\s*", "\\n", ""],
  "prefer": "longer"
}
```

---

## Key Behaviors

1. **Rules run first** → Create structural segments
2. **Post-processing** → For each segment > `maxPages`:
   - Try `breakpoints[0]`, find match (first/last based on `prefer`)
   - If found, break there
   - If not, try `breakpoints[1]`, etc.
   - Empty string `""` = page boundary (always succeeds)
3. **Structural markers always win** → Never break inside a rule-defined section

---

## Scenarios to Test

| # | Scenario | Expected |
|---|----------|----------|
| A | No maxPages set | Segments can span any length |
| B | Segment ≤ maxPages | Keep as-is |
| C | Segment > maxPages, punctuation found | Break at punctuation |
| D | Segment > maxPages, no punctuation, line break found | Break at line break |
| E | Segment > maxPages, no patterns match | Break at page boundary |
| F | Multiple segments need breaking | Each processed independently |
| G | OCR content (no punctuation) | Falls back to line breaks |
| H | Original issue: `مسألة؛` not split | Breakpoints only post-process oversized segments |

---

## Proposed Changes

### [DELETE] Remove from [types.ts](../src/segmentation/types.ts)
- `maxSpan` property
- `fallback` property  
- `occurrence` property (if only used for maxSpan)

### [MODIFY] [types.ts](../src/segmentation/types.ts)
Add to [SegmentationOptions](../src/segmentation/types.ts#333-343):
```typescript
maxPages?: number;
breakpoints?: string[];
prefer?: 'longer' | 'shorter';
```

### [DELETE] Remove from [match-utils.ts](../src/segmentation/match-utils.ts)
- [groupBySpanAndFilter()](../src/segmentation/match-utils.ts#207-264) function

### [MODIFY] [segmenter.ts](../src/segmentation/segmenter.ts)
- Remove maxSpan/fallback logic from main loop
- Add post-processing step after [buildSegments()](../src/segmentation/segmenter.ts#572-674)
- Create `applyBreakpoints()` function

---

## Verification Plan

### Automated Tests
1. Run `bun test` - all existing tests should pass (after adaptation)
2. New breakpoints tests cover all scenarios A-H

### Manual Verification
- Test with book 2588 data to verify `مسألة؛` no longer creates tiny segments


# Breakpoints Segmentation Feature - Walkthrough

## Summary
Successfully implemented the new **breakpoints** post-processing feature to replace the deprecated `maxSpan` functionality in [src/segmentation/segmenter.ts](../src/segmentation/segmenter.ts).

## What Changed

### New API Properties ([SegmentationOptions](../src/segmentation/types.ts#343-398))
- `maxPages?: number` - Maximum pages a segment can span before breakpoints apply
- `breakpoints?: string[]` - Ordered array of regex patterns to try for splitting oversized segments
- `prefer?: 'longer' | 'shorter'` - Whether to select last or first match within window

### Implementation
- **[applyBreakpoints()](../src/segmentation/segmenter.ts#412-592) function** added to [segmenter.ts](../src/segmentation/segmenter.ts) (lines 432-576)
  - Post-processes segments exceeding `maxPages`
  - Tries each breakpoint pattern in order
  - Supports token expansion (`{{tarqim}}`, etc.)
  - Falls back to page boundaries when `""` is in breakpoints array

### Removed Legacy Code
- Removed `maxSpan` property from [SplitRule](../src/segmentation/types.ts#286-287) (deprecated)
- Removed `fallback` property from [SplitRule](../src/segmentation/types.ts#286-287) (deprecated)
- Removed [groupBySpanAndFilter](../src/segmentation/match-utils.ts#207-264) utility and its usage
- Removed all maxSpan/fallback-related tests

### Test Changes
| Category | Result |
|----------|--------|
| New breakpoints tests | 13 tests passing |
| Legacy maxSpan tests | Removed |
| Integration tests (2576, 2588) | Simplified, passing |
| **Total** | **165 tests passing** |

## Verification

```bash
bun test
# 165 pass, 0 fail
```

## Files Modified
- [src/segmentation/segmenter.ts](../src/segmentation/segmenter.ts) - Added [applyBreakpoints()](../src/segmentation/segmenter.ts#412-592), removed maxSpan logic
- [src/segmentation/types.ts](../src/segmentation/types.ts) - Added new options
- [src/segmentation/segmenter.test.ts](../src/segmentation/segmenter.test.ts) - Removed ~400 lines of maxSpan tests, added 13 breakpoints tests
- [src/index.test.ts](../src/index.test.ts) - Simplified integration tests
- [test/2576.json](../test/2576.json) - Removed deprecated `maxSpan` from rules
- [test/2588.json](../test/2588.json) - Removed deprecated `maxSpan` from rules

## Known Lint Warnings
Two "excessive complexity" warnings remain in [segmenter.ts](../src/segmentation/segmenter.ts):
- [applyBreakpoints](../src/segmentation/segmenter.ts#412-592) function (complexity: 73)
- [segmentPages](../src/segmentation/segmenter.ts#593-723) function (complexity: 35)

These are acceptable for now as the functions handle inherently complex segmentation logic.
