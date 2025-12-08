# PR Review Notes - 2025-12-08

- Time: 2025-12-08 16:38:54 UTC
- Reviewer: gpt-5.1-codex-max

## Findings
- Named groups in raw `regex` rules are ignored for capture handling because `hasCapturingGroup` excludes all `(?...)`. This contradicts the `RegexPattern` doc promise (“If regex contains capturing groups, captured content is used”). Named groups like `(?<content>...)` should count toward `usesCapture` and feed metadata.
- `convertPageBreaks` now scans the entire `pageBreaks` set per segment (O(P * S)). For large page counts and many segments this is costly; consider an ordered structure plus binary search to slice only the relevant breaks.
- `groupBySpanAndFilter` groups by `Math.floor(id / maxSpan)` assuming page IDs start at 0 and are contiguous. Sparse or non-zero-based IDs skew grouping/maxSpan semantics. Consider offsetting by the minimum ID or grouping by positional index instead of raw IDs.
- Design note: all pages are concatenated and every rule runs a global regex over the whole string. For very large corpora this can be heavy in memory/CPU; streaming or chunked matching could mitigate if this becomes a bottleneck.

## Suggestions
- Update `hasCapturingGroup` (or add a companion check) to recognize named captures `(?<name>...)` and optionally surface their names so metadata merges work for raw regex rules.
- Store `pageBreaks` in sorted form and binary-search the range for a segment to avoid scanning the whole set on each call.
- Revisit maxSpan grouping to work with arbitrary page IDs (e.g., normalize to an index or a per-rule baseline).

