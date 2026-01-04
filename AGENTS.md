# AGENTS.md

## Project Overview

**flappa-doormal** is a declarative text segmentation library for Arabic texts. It splits pages of content into logical segments (hadiths, chapters, verses) using pattern-based rules with a human-readable template syntax.

### Why This Library Exists

Traditional Arabic text segmentation requires:
- Hand-crafted regular expressions with complex Unicode patterns
- Deep knowledge of Arabic diacritics and character equivalences
- Handling page boundaries and multi-page content spans
- Manual capture group management for metadata extraction

**flappa-doormal** solves these problems with:
- **Declarative rules**: Describe *what* to match, not *how* to match it
- **Template tokens**: `{{raqms}} {{dash}}` instead of `[\u0660-\u0669]+\s*[-–—ـ]`
- **Named captures**: `{{raqms:hadithNum}}` → automatic `meta.hadithNum` extraction
- **Fuzzy matching**: Diacritic-insensitive matching for harakat variations
- **Page-aware**: Tracks which page each segment comes from

## Architecture

### Repository Structure

```text
src/
├── index.ts                    # Main entry point and exports
├── analysis/                   # Analysis helpers module
│   ├── index.ts                # Barrel exports for analysis functions
│   ├── shared.ts               # Shared utilities for analysis
│   ├── line-starts.ts          # analyzeCommonLineStarts (line-based patterns)
│   ├── repeating-sequences.ts  # analyzeRepeatingSequences (continuous text N-grams)
│   └── *.test.ts               # Analysis tests
├── pattern-detection.ts        # Token detection for auto-generating rules
├── pattern-detection.test.ts   # Pattern detection tests
├── recovery.ts                 # Marker recovery utility (recover mistaken lineStartsAfter)
├── recovery.test.ts            # Marker recovery tests
└── segmentation/
    ├── types.ts                # TypeScript type definitions for rules/segments
    ├── segmenter.ts            # Core segmentation engine (segmentPages)
    ├── breakpoint-processor.ts # Breakpoint post-processing engine (applyBreakpoints)
    ├── breakpoint-utils.ts     # Breakpoint processing utilities (windowing, excludes, page joins)
    ├── rule-regex.ts           # SplitRule -> compiled regex builder (buildRuleRegex, processPattern)
    ├── optimize-rules.ts       # Rule optimization logic (merge, dedupe, sort)
    ├── tokens.ts               # Token definitions and expansion logic  
    ├── fuzzy.ts                # Diacritic-insensitive matching utilities
    ├── html.ts                 # HTML utilities (stripHtmlTags)
    ├── textUtils.ts            # Text processing utilities
    ├── match-utils.ts          # Extracted match processing utilities
    ├── segmenter.test.ts       # Core test suite (150+ tests including breakpoints)
    ├── segmenter.bukhari.test.ts # Real-world test cases
    ├── breakpoint-utils.test.ts # Breakpoint utility tests (55 tests)
    ├── rule-regex.test.ts      # Rule regex builder tests
    ├── segmenter-utils.test.ts # Segmenter helper tests
    ├── tokens.test.ts          # Token expansion tests
    ├── fuzzy.test.ts           # Fuzzy matching tests
    ├── textUtils.test.ts       # Text utility tests
    └── match-utils.test.ts     # Utility function tests
```

### Core Components

1. **`segmentPages(pages, options)`** - Main entry point
   - Takes array of `{id, content}` pages and split rules
   - Returns array of `{content, from, to?, meta?}` segments

1. **`recoverMistakenLineStartsAfterMarkers(pages, segments, options, selector)`** - Recovery helper
   - Use when a client mistakenly used `lineStartsAfter` where `lineStartsWith` was intended
   - Deterministic mode reruns segmentation with selected rules converted to `lineStartsWith` and merges recovered `content` back into the provided segments
   - Optional `mode: 'best_effort_then_rerun'` attempts a conservative anchor-based recovery first, then falls back to rerun for unresolved segments

3. **`tokens.ts`** - Template system
   - `TOKEN_PATTERNS` - Map of token names to regex patterns
   - `expandTokensWithCaptures()` - Expands `{{token:name}}` syntax
   - `shouldDefaultToFuzzy()` - Checks if patterns contain fuzzy-default tokens (bab, basmalah, fasl, kitab, naql)
   - `applyTokenMappings()` - Applies named captures (`{{token:name}}`) to raw templates
   - `stripTokenMappings()` - Strips named captures (reverts to `{{token}}`)
   - Supports fuzzy transform for diacritic-insensitive matching
   - **Fuzzy-default tokens**: `bab`, `basmalah`, `fasl`, `kitab`, `naql` - auto-enable fuzzy matching unless `fuzzy: false` is set

4. **`match-utils.ts`** - Extracted utilities (for testability)
   - `extractNamedCaptures()` - Get named groups from regex match
   - `filterByConstraints()` - Apply min/max page filters
   - `anyRuleAllowsId()` - Check if page passes rule constraints

5. **`rule-regex.ts`** - SplitRule → compiled regex builder
   - `buildRuleRegex()` - Compiles rule patterns (`lineStartsWith`, `lineStartsAfter`, `lineEndsWith`, `template`, `regex`)
   - `processPattern()` - Token expansion + auto-escaping + optional fuzzy application
   - `extractNamedCaptureNames()` - Extract `(?<name>...)` groups from raw regex patterns

6. **`optimize-rules.ts`** - Rule management logic
   - `optimizeRules()` - Merges compatible rules, deduplicates patterns, and sorts by specificity (longest patterns first)

7. **`pattern-validator.ts`** - Rule validation utilities
   - `validateRules()` - Detects typos in patterns (missing `{{}}`, unknown tokens, duplicates)
   - `formatValidationReport()` - Formats validation issues into human-readable strings
   - Returns parallel array structure for easy error tracking

8. **`breakpoint-processor.ts`** - Breakpoint post-processing engine
   - `applyBreakpoints()` - Splits oversized structural segments using breakpoint patterns + windowing
   - Applies `pageJoiner` normalization to breakpoint-created segments

9. **`breakpoint-utils.ts`** - Breakpoint processing utilities
   - `normalizeBreakpoint()` - Convert string to BreakpointRule object
   - `isPageExcluded()` - Check if page is in exclude list
   - `isInBreakpointRange()` - Validate page against min/max/exclude constraints
   - `buildExcludeSet()` - Create Set from PageRange[] for O(1) lookups
   - `createSegment()` - Create segment with optional to/meta fields
   - `expandBreakpoints()` - Expand patterns with pre-compiled regexes
   - `buildBoundaryPositions()` - Build position map of page boundaries for O(log n) lookups
   - `findPageIndexForPosition()` - Binary search to find page index for a character position
   - `estimateStartOffsetInCurrentPage()` - Estimate offset when segment starts mid-page
   - `findBreakpointWindowEndPosition()` - Compute window boundary in content-space (robust to marker stripping)
   - `applyPageJoinerBetweenPages()` - Normalize page-boundary join in output segments (`space` vs `newline`)
   - `findBreakPosition()` - Find break position using breakpoint patterns
   - `hasExcludedPageInRange()` - Check if range contains excluded pages
   - `findNextPagePosition()` - Find next page content position
   - `findPatternBreakPosition()` - Find pattern match by preference
   - `findSafeBreakPosition()` - Search backward for a safe linguistic split point (whitespace/punctuation)
   - `adjustForSurrogate()` - Ensure split position doesn't corrupt Unicode surrogate pairs

10. **`types.ts`** - Type definitions
   - `Logger` interface - Optional logging for debugging
   - `SegmentationOptions` - Options with `logger` property
   - `pageJoiner` - Controls how page boundaries are represented in output (`space` default)
   - `PATTERN_TYPE_KEYS` - Runtime array of all pattern types (for UI building)
   - Verbosity levels: `trace`, `debug`, `info`, `warn`, `error`

11. **`fuzzy.ts`** - Arabic text normalization
   - `makeDiacriticInsensitive()` - Generate regex that ignores diacritics

12. **`pattern-detection.ts`** - Token auto-detection (NEW)
   - `detectTokenPatterns()` - Detect tokens in text with positions
   - `generateTemplateFromText()` - Convert text to template string
   - `suggestPatternConfig()` - Suggest rule configuration
   - `analyzeTextForRule()` - Complete analysis returning template + config

## Key Algorithms

### Token Expansion

```
Input:  "{{raqms:num}} {{dash}} {{:text}}"
Output: "(?<num>[\u0660-\u0669]+) [-–—ـ] (?<text>.+)"
```

The expansion algorithm:
1. Splits query into token and text segments
2. Looks up token patterns from `TOKEN_PATTERNS`
3. Wraps in named capture group if `:name` suffix present
4. Applies fuzzy transform if enabled (before wrapping in groups)

### Fuzzy Application Order

**Critical design decision**: Fuzzy transforms are applied to raw token patterns and plain text *before* they're wrapped in regex groups.

```
WRONG:  makeDiacriticInsensitive("(?<name>حدثنا)")  // Breaks ( ? < > )
RIGHT:  "(?<name>" + makeDiacriticInsensitive("حدثنا") + ")"
```

### lineStartsAfter Content Capture

For patterns like `^٦٦٩٦ - (content)`, the content capture is the *last* positional group:

```typescript
// Pattern: ^(?:(?<num>[\u0660-\u0669]+) [-–—ـ] )(.*)
// Match:   m[1] = named group value, m[2] = content
// Solution: Iterate backward from m.length-1 to find last defined capture
```

### Auto-Escaping Brackets in Templates

Template patterns (`lineStartsWith`, `lineStartsAfter`, `lineEndsWith`, `template`) automatically escape `()[]` characters that appear **outside** of `{{token}}` delimiters. This allows intuitive patterns without manual escaping.

**Processing order:**
1. `escapeTemplateBrackets()` escapes `()[]` outside `{{...}}`
2. `expandTokensWithCaptures()` expands tokens to regex patterns
3. Fuzzy transform applied (if enabled)

```
Input:  "({{harf}}): "
Step 1: "\({{harf}}\): "           (brackets escaped)
Step 2: "\([أ-ي]\): "              (token expanded - its [] preserved)
```

**Implementation in `tokens.ts`:**
```typescript
export const escapeTemplateBrackets = (pattern: string): string => {
    return pattern.replace(/(\{\{[^}]*\}\})|([()[\]])/g, (match, token, bracket) => {
        if (token) return token;      // Preserve {{tokens}}
        return `\\${bracket}`;        // Escape brackets
    });
};
```

**Where escaping is applied:**
- `processPattern()` - handles `lineStartsWith`, `lineStartsAfter`, `lineEndsWith`
- Direct `template` processing in `buildRuleRegex()`
- **NOT** applied to `regex` patterns (user has full control)

### Named Captures in Raw Regex Patterns (NEW)

Raw `regex` patterns now support named capture groups for metadata extraction:

```typescript
// Named groups like (?<num>...) are automatically detected and extracted
{ regex: '^(?<num>[٠-٩]+)\\s+[أ-ي\\s]+:\\s*(.+)' }
// meta.num = matched number
// content = the (.+) anonymous capture group
```

**How it works:**
1. `extractNamedCaptureNames()` parses `(?<name>...)` from regex string
2. Named captures go to `segment.meta`
3. Anonymous `(...)` captures can still be used for content extraction

### Breakpoints Post-Processing Algorithm

The `breakpoints` option provides a post-processing mechanism for limiting segment size. Breakpoints runs AFTER all structural rules.

**API Options:**
```typescript
interface SegmentationOptions {
  rules: SplitRule[];
  // Optional preprocessing step: regex replacements applied per-page BEFORE segmentation
  // - default flags: 'gu' (and g+u are always enforced)
  // - pageIds omitted: apply to all pages
  // - pageIds: []: apply to no pages (skip)
  replace?: Array<{ regex: string; replacement: string; flags?: string; pageIds?: number[] }>;
  maxPages?: number;           // Maximum pages a segment can span
  breakpoints?: string[];      // Ordered array of regex patterns (supports token expansion)
  prefer?: 'longer' | 'shorter'; // Select last or first match within window
}
```

**How it works:**
1. Structural rules run first, creating initial segments
2. Breakpoints then processes any segment exceeding `maxPages`
3. Patterns are tried in order until one matches
4. Empty string `''` means "fall back to page boundary"

**Example:**
```typescript
segmentPages(pages, {
  rules: [
    { lineStartsWith: ['{{basmalah}}'] },  // split defaults to 'at'
    { lineStartsWith: ['{{bab}}'], meta: { type: 'chapter' } },
  ],
  maxPages: 2,
  breakpoints: ['{{tarqim}}\\s*', '\\n', ''],  // Try: punctuation → newline → page boundary
  prefer: 'longer',  // Greedy: make segments as large as possible
});
```

**Key behaviors:**
- **Pattern order matters**: First matching pattern wins
- **`prefer: 'longer'`**: Finds LAST match in window (greedy)
- **`prefer: 'shorter'`**: Finds FIRST match (conservative)
- **Recursive**: If split result still exceeds `maxPages`, breakpoints runs again

> **Note**: Older per-rule span limiting approaches were removed in favor of post-processing `breakpoints`.

### 5. Safety-Hardened Content Splitting (NEW)

When using `maxContentLength`, the segmenter prevents text corruption through several layers of fallback logic.

**Algorithm:**
1. **Windowed Pattern Match**: Attempt to find a user-provided `breakpoint` pattern within the character window.
2. **Safe Fallback (Linguistic)**: If no pattern matches, use `findSafeBreakPosition()` to search backward (100 chars) for whitespace or punctuation `[\s\n.,;!?؛،۔]`.
3. **Safe Fallback (Technical)**: If still no safe break found, use `adjustForSurrogate()` to ensure the split doesn't fall between a High and Low Unicode surrogate pair.
4. **Hard Split**: Only as a final resort is a character-exact split performed.

**Progress Guarantee**:
The loop in `processOversizedSegment` has been refactored to remove fixed iteration limits (e.g., 10k). Instead, it relies on strict `cursorPos` progression and input validation (`maxContentLength >= 50`) to support processing infinitely large content streams without risk of truncation.

## Design Decisions

### 1. Why `{{double-braces}}`?

- Single braces `{}` conflict with regex quantifiers `{n,m}`
- Double braces are visually distinct and rarely appear in content
- Consistent with template systems (Handlebars, Mustache)

### 2. Why `lineStartsAfter` vs `lineStartsWith`?

| Pattern | Marker in content? | Use case |
|---------|-------------------|----------|
| `lineStartsWith` | ✅ Yes | Keep marker, segment at boundary |
| `lineStartsAfter` | ❌ No | Strip marker, capture only content |

### 3. Why fuzzy transform at token level?

Applying fuzzy globally would corrupt regex metacharacters. Instead:
- Fuzzy is passed to `expandTokensWithCaptures()` 
- Applied only to Arabic text portions
- Preserves `(`, `)`, `|`, `?`, etc.

### 4. Why extract match utilities?

The original `segmentPages` had complexity 37 (max: 15). Extraction:
- Creates independently testable units
- Reduces main function complexity
- Improves code readability

## Working with the Codebase

### Adding a New Token

1. Add to `TOKEN_PATTERNS` in `tokens.ts`:
   ```typescript
   export const TOKEN_PATTERNS = {
     // ...existing
     verse: '﴿[^﴾]+﴾',  // Quranic verse markers
   };
   ```
2. Add test cases in `segmenter.test.ts`
3. Document in README.md

### Adding a New Pattern Type

1. Add type to union in `types.ts`:
   ```typescript
   type NewPattern = { newPatternField: string[] };
   type PatternType = ... | NewPattern;
   ```
2. Handle in `buildRuleRegex()` in `segmenter.ts`
3. Add comprehensive tests

### Testing Strategy

- **Unit tests**: Each utility function has dedicated tests
- **Integration tests**: Full pipeline tests in `segmenter.test.ts`
- **Real-world tests**: `segmenter.bukhari.test.ts` uses actual hadith data
- Run: `bun test`

## Code Quality Standards

1. **TypeScript strict mode** - No `any` types
2. **Biome linting** - Max complexity 15 per function (some exceptions exist)
3. **JSDoc comments** - All exported functions documented
4. **Test coverage** - 352 tests across 12 files

## Dependencies

### Development
- **@biomejs/biome** - Linting and formatting
- **tsdown** - Build tool (generates `.mjs` and `.d.mts`)
- **Bun** - Runtime and test runner

## Build & Release

```bash
# Install dependencies
bun install

# Run all tests
bun test

# Build distribution
bun run build
# Output: dist/index.mjs (~17 KB gzip ~5.7 KB)

# Run performance test (generates 50K pages, measures segmentation speed/memory)
bun run perf

# Format code
bunx biome format --write .

# Lint code
bunx biome lint .
```

## Lessons Learned

### From Development

1. **Named captures shift positional indices**: When `(?<name>…)` appears before `(.*)`, the content is at `m[2]` not `m[1]`. Solution: iterate backward to find last defined group.

2. **Fuzzy + metacharacters don't mix**: `makeDiacriticInsensitive` expands Arabic to character classes. If applied to `(?<name>text)`, it corrupts the `(`, `?`, `<`, `>` characters.

3. **Alternations need per-alternative fuzzy**: Token `narrated: 'حدثنا|أخبرنا'` requires splitting at `|`, applying fuzzy to each, then rejoining.

4. **Complexity extraction works**: Pulling logic into `match-utils.ts` reduced main function complexity from 37 to 10 and made the code testable.

5. **Rule order matters for specificity**: When multiple rules can match the same position, put specific patterns BEFORE generic ones. Example: `## {{raqms:num}} {{dash}}` must come before `##` to capture the number.

6. **Post-processing beats per-rule limits**: Per-rule span limiting caused premature splits. Moving to post-processing `breakpoints` preserves structural integrity while still limiting segment size.

7. **Window padding matters**: When calculating approximate content windows, 50% padding is needed (not 20%) to ensure enough content is captured for `prefer: 'longer'` scenarios.

8. **Escaping in tests requires care**: TypeScript string `'\\.'` creates regex `\.`, but regex literal `/\./` is already escaped. Double-backslash in strings, single in literals.

9. **Auto-escaping improves DX significantly**: Users expect `(أ):` to match literal parentheses. Auto-escaping `()[]` in template patterns (but not `regex`) gives intuitive behavior while preserving power-user escape hatch.

10. **Page boundary detection needs progressive prefixes**: When breakpoints split content mid-page, checking only the first N characters of a page to detect if the segment ends on that page can fail. Solution: try progressively shorter prefixes (`[80, 60, 40, 30, 20, 15, 12, 10, 8, 6]`) via `JOINER_PREFIX_LENGTHS`. The check uses `indexOf(...) > 0` (not `>= 0`) to avoid false positives when a page prefix appears at position 0 (which indicates the segment *starts* with that page, not *ends* on it).

11. **Boundary-position algorithm improves page attribution**: Building a position map of page boundaries once per segment (O(n)) enables binary search for O(log n) lookups per piece. Key insight: when a segment starts mid-page (common after structural rules), expected boundary estimates must account for the offset into the starting page. Without this adjustment, position-based lookups can return the wrong page when pages have identical content prefixes.

12. **Prefix matching fails with duplicated content**: When using `indexOf()` to find page boundaries by matching prefixes, false positives occur when pages have identical prefixes AND content is duplicated within pages. Solution: use cumulative byte offsets as the source of truth for expected boundaries, and only accept prefix matches within a strict deviation threshold (2000 chars). When content-based detection fails, fall back directly to the calculated offset rather than returning `remainingContent.length` (which merges all remaining pages).

### For Future AI Agents (Recovery + Repo gotchas)

1. **`lineStartsAfter` vs `lineStartsWith` is not “cosmetic”**: `lineStartsAfter` changes output by stripping the matched marker via an internal `contentStartOffset` during segment construction. If a client used it by accident, you cannot reconstruct the exact stripped prefix from output alone without referencing the original pages and re-matching the marker.

2. **Recovery must mirror segmentation’s preprocessing**: If `SegmentationOptions.replace` was used, recovery must apply the same replacements (see `src/segmentation/replace.ts`) before attempting anchoring or rerun alignment, otherwise substring matching and page joins will drift.

3. **Page joining differs between matching and output**:
   - Matching always happens on pages concatenated with `\\n` separators.
   - Output segments may normalize page boundaries (`pageJoiner: 'space' | 'newline'`) and breakpoints post-processing uses its own join normalization utilities.
   Recovery code must be explicit about which representation it’s searching.

4. **Breakpoints can produce “pieces” that were never marker-stripped**: When `maxPages` + `breakpoints` are enabled, only the piece that starts at the original structural boundary could have lost a marker due to `lineStartsAfter`. Mid-segment breakpoint pieces should not be “recovered” unless you can anchor them confidently.

5. **Fuzzy defaults are easy to miss**: Some tokens auto-enable fuzzy matching unless `fuzzy: false` is set (`bab`, `basmalah`, `fasl`, `kitab`, `naql`). If you are validating markers or re-matching prefixes, use the same compilation path as segmentation (`buildRuleRegex` / `processPattern`) so diacritics and token expansion behave identically.

6. **Auto-escaping applies to template-like patterns**: `lineStartsWith`, `lineStartsAfter`, `lineEndsWith`, and `template` auto-escape `()[]` outside `{{tokens}}`. Raw `regex` does not. If you compare patterns by string equality, be careful about escaping and whitespace.

7. **TypeScript union pitfalls with `SplitRule`**: `SplitRule` is a union where only one pattern type should exist. Avoid mutating rules in-place with `delete` on fields (TS often narrows unions and then complains). Prefer rebuilding converted rules via destructuring (e.g. `{ lineStartsAfter, ...rest }` then create `{...rest, lineStartsWith: lineStartsAfter}`).

8. **Biome lint constraints shape implementation**: The repo enforces low function complexity. Expect to extract helpers (alignment, selector resolution, anchoring) to keep Biome happy. Also, Biome can flag regex character-class usage as misleading; prefer alternation (e.g. `(?:\\u200C|\\u200D|\\uFEFF)`) when removing specific codepoints.

9. **When debugging recovery, start here**:
   - `src/segmentation/segmenter.ts` (how content is sliced/trimmed and how `from/to` are computed)
   - `src/segmentation/rule-regex.ts` + `src/segmentation/tokens.ts` (token expansion + fuzzy behavior)
   - `src/segmentation/replace.ts` (preprocessing parity)
   - `src/recovery.ts` (recovery implementation)

10. **Prefer library utilities for UI tasks**: Instead of re-implementing rule merging, validation, or token mapping in client code, use `optimizeRules`, `validateRules`/`formatValidationReport`, and `applyTokenMappings`. They handle edge cases (like duplicate patterns, regex safety, or diacritic handling) that ad-hoc implementations might miss.

11. **Safety Fallback (Search-back)**: When forced to split at a hard character limit, searching backward for whitespace/punctuation (`[\s\n.,;!?؛،۔]`) prevents word-chopping and improves readability significantly.

12. **Unicode Surrogate Safety**: Multi-byte characters (like Emojis) can be corrupted if split in the middle of a surrogate pair. Always use a helper like `adjustForSurrogate` to ensure the split point falls on a valid character boundary.

13. **Recursion/Iteration Safety**: Using a progress-based guard (comparing `cursorPos` before and after loop iteration) is safer than fixed iteration limits for supporting arbitrary-sized content without truncation risks.

14. **Accidental File Overwrites**: Be extremely careful when using tools like `replace_file_content` with large ranges. Verify file integrity frequently (e.g., `git diff`) to catch accidental deletions of existing code or tests. Merging new tests into existing files is a high-risk operation for AI agents.

15. **Invisible Unicode Marks Break Regex Anchors**: Arabic text often contains invisible bidirectional formatting marks like Left-to-Right Mark (`U+200E`), Right-to-Left Mark (`U+200F`), or Arabic Letter Mark (`U+061C`). These appear at line starts after `\n` but before visible characters, breaking `^` anchored patterns. Solution: include an optional zero-width character class prefix in line-start patterns: `^[\u200E\u200F\u061C\u200B\uFEFF]*(?:pattern)`. The library now handles this automatically in `buildLineStartsWithRegexSource` and `buildLineStartsAfterRegexSource`.

### Process Template (Multi-agent design review, TDD-first)

If you want to repeat the “write a plan → get multiple AI critiques → synthesize → update plan → implement TDD-first” workflow, use:

- `docs/ai-multi-agent-tdd-template.md`

### Architecture Insights

- **Declarative > Imperative**: Users describe patterns, library handles regex
- **Composability**: Tokens can be combined freely with `:name` captures
- **Fail gracefully**: Unknown tokens are left as-is, allowing partial templates
- **Post-process > Inline**: Breakpoints runs after rules, avoiding conflicts
- **Dependency injection for testability**: `breakpoint-utils.ts` accepts a `PatternProcessor` function instead of importing `processPattern` directly, enabling independent testing without mocking
- **Optional logging**: Use optional chaining (`logger?.debug?.()`) for zero-overhead when no logger is provided. All log methods are optional, allowing clients to subscribe to only the verbosity levels they need.

---

## Token Reference

| Token | Pattern Description | Example Match |
|-------|---------------------|---------------|
| `{{tarqim}}` | Arabic punctuation (. , ; ? ! ( ) etc.) | `؛` `،` `.` |
| `{{basmalah}}` | "بِسْمِ اللَّهِ" patterns | بِسْمِ اللَّهِ الرَّحْمَنِ |
| `{{bab}}` | "باب" (chapter) | بَابُ الإيمان |
| `{{fasl}}` | "فصل" (section) | فصل: في الطهارة |
| `{{kitab}}` | "كتاب" (book) | كتاب الصلاة |
| `{{raqm}}` | Single Arabic-Indic numeral | ٥ |
| `{{raqms}}` | Multiple Arabic-Indic numerals | ٧٥٦٣ |
| `{{raqms:num}}` | Numerals with named capture | `meta.num = "٧٥٦٣"` |
| `{{dash}}` | Various dash characters | - – — ـ |
| `{{harfs}}` | Single-letter codes separated by spaces | `د ت س ي ق` |
| `{{rumuz}}` | rijāl/takhrīj source abbreviations (matches blocks like `خت ٤`, `خ سي`, `دت عس ق`) | `خت ٤` |
| `{{numbered}}` | Composite: `{{raqms}} {{dash}}` | ٧٥٦٣ - |

**Named captures**: Add `:name` suffix to capture into `meta`:
```typescript
'{{raqms:hadithNum}} {{dash}}' 
// → segment.meta.hadithNum = "٧٥٦٣"
```

## Page-start Guard (`pageStartGuard`)

Some books contain page-wrap continuations where a new page starts with a common line-start marker (e.g. `{{naql}}`) but it is not a true new segment.

Use `pageStartGuard` on a rule to allow matches at the start of a page **only if** the previous page’s last non-whitespace character matches a pattern (tokens supported):

```typescript
{
  fuzzy: true,
  lineStartsWith: ['{{naql}}'],
  split: 'at',
  pageStartGuard: '{{tarqim}}'
}
```

Notes:
- Applies only at page starts; mid-page line starts are unaffected.
- Implemented in `src/segmentation/segmenter.ts` match filtering.

## Analysis Helper (`analyzeCommonLineStarts`)

`analyzeCommonLineStarts(pages)` scans lines across pages and returns common template-like line-start signatures (tokenized with `TOKEN_PATTERNS`). It’s intended to help you quickly discover rule candidates without using an LLM.

Useful options (recent additions):
- **`sortBy`**: `'specificity'` (default) or `'count'` (highest-frequency first). `topK` is applied **after** sorting.
- **`lineFilter`**: restrict which lines are analyzed (e.g. only Markdown headings).
- **`prefixMatchers`**: consume syntactic prefixes before tokenization (default includes headings via `/^#+/u`).
  - This is how you see variations *after* prefixes like `##` instead of collapsing to just `"##"`.
- **`normalizeArabicDiacritics`**: `true` by default so tokens match diacritized forms (e.g. `وأَخْبَرَنَا` → `{{naql}}`).
- **`whitespace`**: `'regex'` (default) uses `\\s*` placeholders; `'space'` uses literal spaces in returned signatures.

**Note on brackets in returned signatures**:
- `analyzeCommonLineStarts()` emits **template-like** signatures.
- It intentionally **does not escape literal `()` / `[]`** (e.g. `(ح)` stays `(ح)`), because template patterns auto-escape `()[]` later.
- If you reuse a signature inside a raw `regex` rule, you may need to escape literal brackets yourself.

Examples:

```typescript
import { analyzeCommonLineStarts } from 'flappa-doormal';

// Top 20 by frequency
const top20 = analyzeCommonLineStarts(pages, { sortBy: 'count', topK: 20 });

// Only headings (## / ### / ...)
const headings = analyzeCommonLineStarts(pages, {
  lineFilter: (line) => line.startsWith('#'),
  sortBy: 'count',
});

// Custom prefixes (e.g. blockquotes + headings)
const quoted = analyzeCommonLineStarts(pages, {
  lineFilter: (line) => line.startsWith('>') || line.startsWith('#'),
  prefixMatchers: [/^>+/u, /^#+/u],
  sortBy: 'count',
});
```

## Repeating Sequence Analysis (`analyzeRepeatingSequences`)

For continuous text **without line breaks** (prose-like content), use `analyzeRepeatingSequences(pages)`. It scans for commonly repeating word/token sequences (N-grams) across pages.

Key options:
- `minElements` / `maxElements`: N-gram size range (default 1-3)
- `minCount`: Minimum occurrences to include (default 3)
- `topK`: Maximum patterns to return (default 20)
- `requireToken`: Only patterns containing `{{tokens}}` (default true)
- `normalizeArabicDiacritics`: Ignore diacritics when matching (default true)

Example:
```typescript
import { analyzeRepeatingSequences } from 'flappa-doormal';

const patterns = analyzeRepeatingSequences(pages, { minCount: 3, topK: 20 });
// [{ pattern: '{{naql}}', count: 42, examples: [...] }, ...]
```

## Analysis → Segmentation Workflow

Use analysis functions to discover patterns, then pass to `segmentPages()`:

1. **Continuous text**: `analyzeRepeatingSequences()` → build rules → `segmentPages()`
2. **Structured text**: `analyzeCommonLineStarts()` → build rules → `segmentPages()`

See README.md for complete examples.

---

## Debugging Page Boundary Detection (Added 2026-01-04)

### The Problem: False Positives in Prefix Matching

When using `maxPages=0` with empty breakpoint `['']` (page boundary breaks), the segmenter can fail when:
1. **Pages have identical prefixes** - All pages start with the same text
2. **Duplicated content within pages** - The same phrase appears multiple times in a single page
3. **Long content** - Pages are thousands of characters, putting false matches closer to expected boundaries

**Root cause**: The `findPageStartNearExpectedBoundary` function in `breakpoint-utils.ts` uses prefix matching to find page boundaries. When content is duplicated, it finds matches at incorrect positions within the current page instead of at the actual page boundary.

### Key Functions in the Breakpoint Chain

1. **`applyBreakpoints()`** - Entry point for breakpoint processing
2. **`processOversizedSegment()`** - Iteratively breaks segments exceeding `maxPages`
3. **`computeWindowEndIdx()`** - Calculates max page index for current window
4. **`findBreakpointWindowEndPosition()`** - Finds the byte position where the window ends
5. **`findPageStartNearExpectedBoundary()`** - Content-based search for page start position
6. **`handlePageBoundaryBreak()`** - Handles empty pattern `''` (page boundary)
7. **`buildCumulativeOffsets()`** - Pre-computes exact byte positions for each page

### Debug Strategy

1. **Check cumulative offsets first** - `buildCumulativeOffsets()` returns correct positions from `pages.join('\n')`
2. **Trace `expectedBoundary`** - This is calculated correctly from cumulative offsets
3. **Check `findPageStartNearExpectedBoundary` candidates** - The bug is usually here; it finds false matches
4. **Verify the deviation check** - Matches must be within `MAX_DEVIATION` (2000 chars) of expected boundary

### The Fix Applied

Two changes in `breakpoint-utils.ts`:

1. **`findPageStartNearExpectedBoundary`** - Added `MAX_DEVIATION` check to reject matches too far from expected boundary:
   ```typescript
   const MAX_DEVIATION = 2000;
   if (bestDistance <= MAX_DEVIATION) {
       return bestCandidate.pos;
   }
   // Continue trying shorter prefixes or return -1
   ```

2. **`findBreakpointWindowEndPosition`** - Changed fallback from `remainingContent.length` to `bestExpectedBoundary`:
   ```typescript
   // Before (bug): return remainingContent.length; // Merges all remaining pages!
   // After (fix): return Math.min(bestExpectedBoundary, remainingContent.length);
   ```

### Test Case Pattern for This Bug

```typescript
it('should correctly split pages with identical prefixes and duplicated content', () => {
    const sharedPrefix = 'SHARED PREFIX ';
    const filler = 'Lorem ipsum. '.repeat(200); // ~6000 chars
    const pages: Page[] = [
        { content: sharedPrefix + 'start ' + filler + sharedPrefix + 'end', id: 0 },
        { content: sharedPrefix + 'page1', id: 1 },
        { content: sharedPrefix + 'page2', id: 2 },
    ];
    const result = segmentPages(pages, { breakpoints: [''], maxPages: 0 });
    expect(result).toHaveLength(3); // Without fix: 2 or 1
});
```

---
15. **Use Synthesized AI Reviews**: For complex safety features, getting reviews from multiple models (Claude, GPT, etc.) and synthesizing them into a single action plan (see `docs/reviews/max-content-length-review-synthesis.md`) revealed critical edge cases like Arabic diacritic corruption and surrogate pair safety that a single model might miss.
