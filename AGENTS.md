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

2. **`tokens.ts`** - Template system
   - `TOKEN_PATTERNS` - Map of token names to regex patterns
   - `expandTokensWithCaptures()` - Expands `{{token:name}}` syntax
   - `shouldDefaultToFuzzy()` - Checks if patterns contain fuzzy-default tokens (bab, basmalah, fasl, kitab, naql)
   - Supports fuzzy transform for diacritic-insensitive matching
   - **Fuzzy-default tokens**: `bab`, `basmalah`, `fasl`, `kitab`, `naql` - auto-enable fuzzy matching unless `fuzzy: false` is set

3. **`match-utils.ts`** - Extracted utilities (for testability)
   - `extractNamedCaptures()` - Get named groups from regex match
   - `filterByConstraints()` - Apply min/max page filters
   - `anyRuleAllowsId()` - Check if page passes rule constraints

4. **`rule-regex.ts`** - SplitRule → compiled regex builder
   - `buildRuleRegex()` - Compiles rule patterns (`lineStartsWith`, `lineStartsAfter`, `lineEndsWith`, `template`, `regex`)
   - `processPattern()` - Token expansion + auto-escaping + optional fuzzy application
   - `extractNamedCaptureNames()` - Extract `(?<name>...)` groups from raw regex patterns

5. **`pattern-validator.ts`** - Rule validation utilities
   - `validateRules()` - Detects typos in patterns (missing `{{}}`, unknown tokens, duplicates)
   - Returns parallel array structure for easy error tracking

6. **`breakpoint-processor.ts`** - Breakpoint post-processing engine
   - `applyBreakpoints()` - Splits oversized structural segments using breakpoint patterns + windowing
   - Applies `pageJoiner` normalization to breakpoint-created segments

7. **`breakpoint-utils.ts`** - Breakpoint processing utilities
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

7. **`types.ts`** - Type definitions
   - `Logger` interface - Optional logging for debugging
   - `SegmentationOptions` - Options with `logger` property
   - `pageJoiner` - Controls how page boundaries are represented in output (`space` default)
   - Verbosity levels: `trace`, `debug`, `info`, `warn`, `error`

8. **`fuzzy.ts`** - Arabic text normalization
   - `makeDiacriticInsensitive()` - Generate regex that ignores diacritics

9. **`pattern-detection.ts`** - Token auto-detection (NEW)
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

The `breakpoints` option provides a post-processing mechanism for limiting segment size. Unlike the deprecated `maxSpan` (which was per-rule), breakpoints runs AFTER all structural rules.

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

> **Note**: The old `maxSpan` and `fallback` properties on `SplitRule` are deprecated and removed.

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

6. **Post-processing beats per-rule limits**: The `maxSpan` approach (per-rule page limits) caused premature splits. Moving to post-processing `breakpoints` preserves structural integrity while still limiting segment size.

7. **Window padding matters**: When calculating approximate content windows, 50% padding is needed (not 20%) to ensure enough content is captured for `prefer: 'longer'` scenarios.

8. **Escaping in tests requires care**: TypeScript string `'\\.'` creates regex `\.`, but regex literal `/\./` is already escaped. Double-backslash in strings, single in literals.

9. **Auto-escaping improves DX significantly**: Users expect `(أ):` to match literal parentheses. Auto-escaping `()[]` in template patterns (but not `regex`) gives intuitive behavior while preserving power-user escape hatch.

10. **Page boundary detection needs progressive prefixes**: When breakpoints split content mid-page, checking only the first N characters of a page to detect if the segment ends on that page can fail. Solution: try progressively shorter prefixes (`[80, 60, 40, 30, 20, 15, 12, 10, 8, 6]`) via `JOINER_PREFIX_LENGTHS`. The check uses `indexOf(...) > 0` (not `>= 0`) to avoid false positives when a page prefix appears at position 0 (which indicates the segment *starts* with that page, not *ends* on it).

11. **Boundary-position algorithm improves page attribution**: Building a position map of page boundaries once per segment (O(n)) enables binary search for O(log n) lookups per piece. Key insight: when a segment starts mid-page (common after structural rules), expected boundary estimates must account for the offset into the starting page. Without this adjustment, position-based lookups can return the wrong page when pages have identical content prefixes.

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


