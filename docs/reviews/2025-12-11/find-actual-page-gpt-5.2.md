## Review: `findActualStartPage` / `findActualEndPage`
## Reviewer: gpt-5.2

### Summary
`findActualStartPage` and `findActualEndPage` attempt to infer which page(s) a produced segment piece belongs to by doing **short substring/prefix matching** against per-page content (roughly the first ~30 chars). This is a **heuristic**, not a guaranteed-correct mapping.

In the current segmentation flow, `pieceContent` is derived from `remainingContent.slice(0, breakPosition).trim()`, where `breakPosition` is computed using patterns and/or `cumulativeOffsets`. Despite already having offsets, the code then “re-discovers” page boundaries by searching text.

### Correctness / Safety
This approach is **not strictly safe**: it can mis-attribute the start or end page in realistic cases.

#### Duplicate substrings across pages
If **the same (or very similar) prefix** appears on multiple pages (common in OCR/header/footer/running-title scenarios), the helpers can return the wrong page.

- **Start page ambiguity (`findActualStartPage`)**:
  - It searches forward from `currentFromIdx` and returns the **first** page whose prefix matches the piece (or whose trimmed-start matches the piece prefix).
  - If multiple candidate pages share the same 30-char prefix, it can “snap” the start to an earlier page than the piece truly starts on.

- **End page ambiguity (`findActualEndPage`)**:
  - It scans backward and checks `pieceContent.indexOf(pagePrefix) > 0`.
  - If a later page’s prefix appears **anywhere inside** the piece due to repetition (headers, boilerplate, quotes, scripture refrains, etc.), it can “prove” an end page that isn’t actually included.

#### Other brittleness
- The logic only uses a short prefix (30 chars), so it’s sensitive to:
  - repeated boilerplate,
  - normalization differences,
  - whitespace trimming behavior (`trim()` / `trimStart()`),
  - very short pages.

### Performance
These helpers are usually cheap for small windows, but they have an unfavorable worst-case profile:

- `findActualEndPage` performs (pages scanned) iterations and each iteration does `pieceContent.indexOf(prefix)`, which is proportional to the piece length.
- In worst case, for each piece you get roughly **O(P × L)** where:
  - **P** = number of pages scanned in the window,
  - **L** = length of `pieceContent`.

Because the segmentation loop can produce multiple pieces per segment, this can become noticeable on large documents / large `maxPages` windows.

### Recommendation (Primary)
Stop using text substring matching to derive page attribution.

You already have `cumulativeOffsets` and `breakPosition` derived from offsets/pattern matches. Prefer an **offset-based mapping**, which is:
- **Correct even when page text repeats**,
- **Deterministic**, and
- Typically **O(log P)** (binary search) or **O(1)** amortized (two-pointer) rather than scanning plus substring search.

Concrete direction:
- Treat the segment’s content as a concatenation of page contents (with the same separator model used when building `cumulativeOffsets`).
- Maintain a running “global offset” for how far into the concatenated segment you are.
- Map:
  - `pieceStartOffset` → `actualStartIdx`
  - `pieceEndOffset` → `actualEndIdx`
  using `cumulativeOffsets` (binary search for the greatest index with `cumulativeOffsets[i] <= offset`).

This removes ambiguity entirely: page identity comes from position, not from content coincidence.

### If we keep the heuristic (Secondary, not preferred)
If you keep prefix matching, reduce risk:
- **Use longer, more distinctive anchors** (e.g., 80–200 chars) and/or combine **prefix + suffix**.
- **Require boundary-like alignment**, not “anywhere inside piece”:
  - for end page, look for the next page’s prefix at the correct expected boundary rather than `indexOf(...) > 0`.
- **Add tie-breakers**:
  - if multiple pages match, prefer the one whose prefix occurs closest to the expected offset (if you compute an expected offset anyway).
- **Add tests for repeated headers**:
  - pages that all start with the same running header;
  - repeated boilerplate paragraphs;
  - very short pages;
  - whitespace-normalization deltas.

### Suggested next action
Implement the offset-based mapping and delete/retire `findActualStartPage` / `findActualEndPage` (or leave them behind a fallback flag only). Then add regression tests covering repeated headers/boilerplate to ensure page attribution remains stable.