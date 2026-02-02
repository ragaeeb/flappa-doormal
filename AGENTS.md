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

src/
├── types/                      # Centralized type definitions
│   ├── index.ts                # Common types (Page, Segment, etc.)
│   ├── rules.ts                # SplitRule and pattern rule types
│   ├── breakpoints.ts          # Breakpoint types
│   ├── options.ts              # SegmentationOptions and Logger
│   └── segmenter.ts            # Internal segmenter types
├── analysis/                   # Pattern discovery module
│   ├── line-starts.ts          # analyzeCommonLineStarts (frequent line markers)
│   ├── repeating-sequences.ts  # analyzeRepeatingSequences (N-grams)
│   └── shared.ts               # Shared analysis utilities
├── segmentation/               # Core engine components
│   ├── segmenter.ts            # High-level API (segmentPages)
│   ├── breakpoint-processor.ts # Breakpoint enforcement and windowing
│   ├── breakpoint-utils.ts     # Windowing, exclusion, and joining logic
│   ├── rule-regex.ts           # Pattern-to-RegExp compiler
│   ├── tokens.ts               # Arabic-aware pattern tokens
│   ├── segmenter-rule-utils.ts # Rule partitioning and optimization
│   ├── fast-fuzzy-prefix.ts    # High-performance fuzzy matching
│   ├── debug-meta.ts           # _flappa debug metadata helpers
│   ├── pattern-validator.ts    # Rule syntax validation
│   ├── match-utils.ts          # Capture group and constraint logic
│   └── breakpoint-constants.ts # Performance thresholds and limits
├── optimization/               # Rule optimization module
│   └── optimize-rules.ts       # Specificity-based sorting and merging
├── preprocessing/              # Text normalization module
│   └── transforms.ts           # Built-in preprocess transforms (removeZeroWidth, condenseEllipsis, fixTrailingWaw)
├── utils/                      # Low-level helpers
│   └── textUtils.ts            # Diacritics, Unicode, and bracket escaping
├── index.ts                    # Public barrel exports
├── recovery.ts                 # Mistaken stripping recovery logic
├── detection.ts                # Pattern auto-detection (standalone)
└── *.test.ts                   # Unit and integration tests (co-located)

### Core Components

1. **`segmentPages(pages, options)`** - Main entry point (`src/segmentation/segmenter.ts`)
   - Takes array of `{id, content}` pages and split rules
   - Returns array of `{content, from, to?, meta?}` segments
   - Orchestrates rule matching, optimization, and breakpoint processing

2. **`recoverMistakenLineStartsAfterMarkers(...)`** - Recovery helper (`src/recovery.ts`)
   - Use when a client mistakenly used `lineStartsAfter` where `lineStartsWith` was intended
   - Deterministic mode reruns segmentation with selected rules converted to `lineStartsWith` and merges recovered `content` back into the provided segments
   - Optional `mode: 'best_effort_then_rerun'` attempts a conservative anchor-based recovery first, then falls back to rerun for unresolved segments

3. **`tokens.ts`** - Template system (`src/segmentation/tokens.ts`)
   - `TOKEN_PATTERNS` - Map of token names to regex patterns
   - `expandTokensWithCaptures()` - Expands `{{token:name}}` syntax
   - `shouldDefaultToFuzzy()` - Auto-enables fuzzy matching for `bab`, `basmalah`, `fasl`, `kitab`, `naql`
   - `applyTokenMappings()` - Applies named captures (`{{token:name}}`) to raw templates
   - `stripTokenMappings()` - Strips named captures (reverts to `{{token}}`)

4. **`rule-regex.ts`** - Rule compiler (`src/segmentation/rule-regex.ts`)
   - `buildRuleRegex()` - Compiles various rule types to executable RegExp
   - `processPattern()` - Token expansion, auto-escaping, and fuzzy application
   - `extractNamedCaptureNames()` - Extract metadata field names from raw regex

5. **`fast-fuzzy-prefix.ts`** - Performance optimization (`src/segmentation/fast-fuzzy-prefix.ts`)
   - Performs diacritic-insensitive matching without expensive regex alternations
   - Used for frequent line-start rules in larger books

6. **`optimize-rules.ts`** - Rule management (`src/optimization/optimize-rules.ts`)
   - `optimizeRules()` - Merges compatible rules, deduplicates patterns, and sorts by specificity (longest patterns first) to maximize match performance

7. **`pattern-validator.ts`** - Rule validation (`src/segmentation/pattern-validator.ts`)
   - `validateRules()` - Detects typos, unknown tokens, and duplicate patterns
   - Returns detailed reports for UI error highlighting

8. **`breakpoint-processor.ts`** - Structural splitting engine (`src/segmentation/breakpoint-processor.ts`)
   - `applyBreakpoints()` - Splits oversized chunks using breakpoint patterns + windowing
   - Robustly handles page attribution and content joining across boundaries

9. **`debug-meta.ts`** - Debugging utilities (`src/segmentation/debug-meta.ts`)
   - Generates the `_flappa` metadata object for segments
   - Tracks which rule index, pattern type, or breakpoint triggered the segment split

10. **`src/types/`** - Centralized type system
    - `rules.ts`: Core `SplitRule` and `Replacement` types
    - `breakpoints.ts`: `Breakpoint` and `BreakpointRule` types
    - `options.ts`: Comprehensive `SegmentationOptions` and `Logger` definitions
    - `index.ts`: Public API types for consumers

11. **`textUtils.ts`** - Low-level helpers (`src/utils/textUtils.ts`)
    - `makeDiacriticInsensitive()`: Arabic-aware regex generation
    - `adjustForUnicodeBoundary()`: Prevents invalid splits across multi-character clusters
    - `escapeTemplateBrackets()`: Auto-escaping logic for non-token brackets

12. **`detection.ts`** - Pattern auto-detection (`src/detection.ts`)
    - Analyzes raw text to suggest optimal templates and rule configurations
    - Heuristically identifies numbers, headers, and structural markers

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

**Implementation in `src/utils/textUtils.ts`:**
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

**Important: Split Defaults Differ**
| Type | Default `split` |
|------|-----------------|
| **Rules** (SplitRule) | `'at'` |
| **Breakpoints** (BreakpointRule) | `'after'` |

**API Options:**
```typescript
interface SegmentationOptions {
  rules: SplitRule[];
  // Optional preprocessing: named transforms applied per-page BEFORE buildPageMap()
  preprocess?: PreprocessTransform[];
  maxPages?: number;           // Maximum pages a segment can span
  maxContentLength?: number;   // Maximum characters per segment (min: 50)
  breakpoints?: Breakpoint[];  // Ordered array of patterns (supports token expansion)
  prefer?: 'longer' | 'shorter'; // Select last or first match within window
}

// Preprocessing transforms (run before pattern matching)
type PreprocessTransform =
  | 'removeZeroWidth'    // Strip invisible Unicode controls
  | 'condenseEllipsis'   // "..." → "…"
  | 'fixTrailingWaw'     // " و " → " و"
  | { type: 'removeZeroWidth'; mode?: 'strip' | 'space'; min?: number; max?: number }
  | { type: 'condenseEllipsis'; min?: number; max?: number }
  | { type: 'fixTrailingWaw'; min?: number; max?: number };

// Breakpoint can be a string or object with split control
type Breakpoint = string | BreakpointRule;
interface BreakpointRule {
  pattern?: string;  // Auto-escapes ()[] like template patterns
  regex?: string;    // Raw regex, no bracket escaping (for (?:...) groups)
  split?: 'at' | 'after';  // Default: 'after'
  min?: number;            // Minimum page ID for this breakpoint
  max?: number;            // Maximum page ID for this breakpoint
  exclude?: PageRange[];   // Pages to skip this breakpoint
}
```

**`pattern` vs `regex` field:**
| Field | Bracket escaping | Use case |
|-------|-----------------|----------|
| `pattern` | `()[]` auto-escaped | Simple patterns, token-friendly |
| `regex` | None (raw regex) | Complex regex with groups, lookahead |

```typescript
// pattern field - brackets are auto-escaped (matches literal parentheses)
{ pattern: '(a)', split: 'after' }

// regex field - raw regex, use for non-capturing groups
{ regex: '\\s+(?:ولهذا|وكذلك|فلذلك)', split: 'at' }

// Both support token expansion
{ regex: '{{tarqim}}\\s*', split: 'after' }
```

**How it works:**
1. Structural rules run first, creating initial segments
2. Breakpoints then processes any segment exceeding `maxPages`
3. Patterns are tried in order until one matches
4. Empty string `''` means "fall back to page boundary"

**Split behavior:**
- **`split: 'after'` (default)**: Previous segment ends WITH the matched text
- **`split: 'at'`**: Previous segment ends BEFORE the matched text (match starts next segment)

**Example:**
```typescript
segmentPages(pages, {
  rules: [
    { lineStartsWith: ['{{basmalah}}'] },
    { lineStartsWith: ['{{bab}}'], meta: { type: 'chapter' } },
  ],
  maxPages: 2,
  breakpoints: [
    { pattern: '{{tarqim}}\\s*', split: 'after' }, // Punctuation ends current segment
    { regex: '\\s+(?:ولهذا|وكذلك)', split: 'at' }, // Word starts next segment (with groups)
    '',                                            // Fall back to page boundary
  ],
  prefer: 'longer',
});
```

**Key behaviors:**
- **Pattern order matters**: First matching pattern wins
- **`prefer: 'longer'`**: Finds LAST match in window (greedy)
- **`prefer: 'shorter'`**: Finds FIRST match (conservative)
- **Recursive**: If split result still exceeds `maxPages`, breakpoints runs again
- **Lookahead patterns unsupported**: Zero-length matches are skipped; use `split: 'at'` instead
- **Position 0 protection**: Matches at position 0 are skipped for `split: 'at'` to prevent empty segments
- **Mid-word matching caveat**: Patterns match substrings; use `\s+` prefix for whole-word matching
- **`\b` doesn't work with Arabic**: Use `\s+` prefix instead (Arabic letters aren't "word characters")

> **Note**: Older per-rule span limiting approaches were removed in favor of post-processing `breakpoints`.

### 5. Safety-Hardened Content Splitting (NEW)

When using `maxContentLength`, the segmenter prevents text corruption through several layers of fallback logic.

**Algorithm:**
1. **Windowed Pattern Match**: Attempt to find a user-provided `breakpoint` pattern within the character window.
2. **Safe Fallback (Linguistic)**: If no pattern matches, use `findSafeBreakPosition()` to search backward (100 chars) for whitespace or punctuation `[\s\n.,;!?؛،۔]`.
3. **Safe Fallback (Technical)**: If still no safe break found, use `adjustForUnicodeBoundary()` to ensure the split doesn't corrupt surrogate pairs, combining marks, ZWJ/ZWNJ, or variation selectors.
4. **Hard Split**: Only as a final resort is a character-exact split performed.

**Progress Guarantee**:
The loop in `processOversizedSegment` has been refactored to remove fixed iteration limits (e.g., 10k). Instead, it relies on strict `cursorPos` progression and input validation (`maxContentLength >= 50`) to support processing infinitely large content streams without risk of truncation.

### 6. Debug Metadata (`_flappa`)

When `debug: true` is enabled in `SegmentationOptions`, the library attaches a `_flappa` object to each segment's `meta` property. This provides provenance and split-reason tracking.

#### Metadata Structure

The `_flappa` object contains different fields based on why the segment was produced:

**Rule-based Splits**
- `rule.index` (number): The index of the rule in the `rules` array.
- `rule.patternType` (string): The type of pattern used (e.g., `'lineStartsWith'`).

**Breakpoint-based Splits**
- `breakpoint.index` (number): The index of the breakpoint in the `breakpoints` array.
- `breakpoint.pattern` (string): The pattern (or `regex`) that matched.
- `breakpoint.kind` (string): Either `'pattern'` or `'regex'`.

**Safety Fallback Splits (`maxContentLength`)**
- `contentLengthSplit.maxContentLength` (number): The limit that was exceeded.
- `contentLengthSplit.splitReason` (string):
  - `'whitespace'`: Split at a safe space/newline.
  - `'unicode_boundary'`: Split at a safe character boundary (no surrogate corruption).
  - `'grapheme_cluster'`: Split at a safe grapheme cluster boundary.

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

1. Add to `TOKEN_PATTERNS` in `src/segmentation/tokens.ts`:
   ```typescript
   export const TOKEN_PATTERNS = {
     // ...existing
     verse: '﴿[^﴾]+﴾',  // Quranic verse markers
   };
   ```
2. Add test cases in `src/segmentation/segmenter.test.ts`
3. Document in README.md

### Adding a New Pattern Type

1. Add type to union in `src/types/rules.ts`:
   ```typescript
   type NewPattern = { newPatternField: string[] };
   type PatternType = ... | NewPattern;
   ```
2. Handle in `buildRuleRegex()` in `src/segmentation/rule-regex.ts`
3. Add comprehensive tests

### Testing Strategy

- **Unit tests**: Each utility function has dedicated tests
- **Integration tests**: Full pipeline tests in `src/segmentation/segmenter.test.ts`
- **Real-world tests**: `src/segmentation/segmenter.bukhari.test.ts` uses actual hadith data
- **Style convention**: Prefer `it('should ...', () => { ... })` (Bun) for consistency across the suite
- Run: `bun test`

## Code Quality Standards

1. **TypeScript strict mode** - No `any` types
2. **Biome linting** - Max complexity 15 per function (some exceptions exist)
3. **JSDoc comments** - All exported functions documented
4. **Test coverage** - 642 tests across 21 files

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

13. **ASCII vs Arabic-Indic Numerals**: While most classical Arabic texts use Arabic-Indic digits (`٠-٩`), modern digitizers often mix them with ASCII digits (`0-9`). Providing separate tokens (`{{raqms}}` for Arabic and `{{nums}}` for ASCII) allows better precision in rule definitions while keeping patterns readable. Always check which digit set is used in the source text before authoring rules.

### For Future AI Agents (Recovery + Repo gotchas)

1. **`lineStartsAfter` vs `lineStartsWith` is not “cosmetic”**: `lineStartsAfter` changes output by stripping the matched marker via an internal `contentStartOffset` during segment construction. If a client used it by accident, you cannot reconstruct the exact stripped prefix from output alone without referencing the original pages and re-matching the marker.

2. **Page joining differs between matching and output**:
   - Matching always happens on pages concatenated with `\\n` separators.
   - Output segments may normalize page boundaries (`pageJoiner: 'space' | 'newline'`) and breakpoints post-processing uses its own join normalization utilities.
   Recovery code must be explicit about which representation it’s searching.

3. **Breakpoints can produce “pieces” that were never marker-stripped**: When `maxPages` + `breakpoints` are enabled, only the piece that starts at the original structural boundary could have lost a marker due to `lineStartsAfter`. Mid-segment breakpoint pieces should not be “recovered” unless you can anchor them confidently.

4. **Fuzzy defaults are easy to miss**: Some tokens auto-enable fuzzy matching unless `fuzzy: false` is set (`bab`, `basmalah`, `fasl`, `kitab`, `naql`). If you are validating markers or re-matching prefixes, use the same compilation path as segmentation (`buildRuleRegex` / `processPattern`) so diacritics and token expansion behave identically.

5. **Auto-escaping applies to template-like patterns**: `lineStartsWith`, `lineStartsAfter`, `lineEndsWith`, and `template` auto-escape `()[]` outside `{{tokens}}`. Raw `regex` does not. If you compare patterns by string equality, be careful about escaping and whitespace.

6. **TypeScript union pitfalls with `SplitRule`**: `SplitRule` is a union where only one pattern type should exist. Avoid mutating rules in-place with `delete` on fields (TS often narrows unions and then complains). Prefer rebuilding converted rules via destructuring (e.g. `{ lineStartsAfter, ...rest }` then create `{...rest, lineStartsWith: lineStartsAfter}`).

7. **Biome lint constraints shape implementation**: The repo enforces low function complexity. Expect to extract helpers (alignment, selector resolution, anchoring) to keep Biome happy. Also, Biome can flag regex character-class usage as misleading; prefer alternation (e.g. `(?:\\u200C|\\u200D|\\uFEFF)`) when removing specific codepoints.

8. **When debugging recovery, start here**:
   - `src/segmentation/segmenter.ts` (how content is sliced/trimmed and how `from/to` are computed)
   - `src/segmentation/rule-regex.ts` + `src/segmentation/tokens.ts` (token expansion + fuzzy behavior)
   - `src/preprocessing/transforms.ts` (preprocessing transforms: removeZeroWidth, condenseEllipsis, fixTrailingWaw)
   - `src/recovery.ts` (recovery implementation)

9. **Prefer library utilities for UI tasks**: Instead of re-implementing rule merging, validation, or token mapping in client code, use `optimizeRules`, `validateRules`/`formatValidationReport`, and `applyTokenMappings`. They handle edge cases (like duplicate patterns, regex safety, or diacritic handling) that ad-hoc implementations might miss.

10. **Safety Fallback (Search-back)**: When forced to split at a hard character limit, searching backward for whitespace/punctuation (`[\s\n.,;!?؛،۔]`) prevents word-chopping and improves readability significantly.

11. **Unicode Boundary Safety (Surrogates + Graphemes)**: Multi-byte characters (like emojis) can be corrupted if split in the middle of a surrogate pair. Similarly, Arabic diacritics (combining marks), ZWJ/ZWNJ, and variation selectors can be orphaned if a hard split lands in the middle of a grapheme cluster. Use `adjustForUnicodeBoundary` when forced to hard-split near a limit.

12. **Recursion/Iteration Safety**: Using a progress-based guard (comparing `cursorPos` before and after loop iteration) is safer than fixed iteration limits for supporting arbitrary-sized content without truncation risks.

13. **Accidental File Overwrites**: Be extremely careful when using tools like `replace_file_content` with large ranges. Verify file integrity frequently (e.g., `git diff`) to catch accidental deletions of existing code or tests. Merging new tests into existing files is a high-risk operation for AI agents.

14. **Invisible Unicode Marks Break Regex Anchors**: Arabic text often contains invisible formatting marks like Left-to-Right Mark (`U+200E`), Right-to-Left Mark (`U+200F`), Arabic Letter Mark (`U+061C`), Zero-Width Space (`U+200B`), Zero-Width Non-Joiner (`U+200C`), Zero-Width Joiner (`U+200D`), or BOM (`U+FEFF`). These can appear at line starts after `\n` but before visible characters, breaking `^` anchored patterns. Solution: include an optional zero-width character class prefix in line-start patterns: `^[\u200E\u200F\u061C\u200B\u200C\u200D\uFEFF]*(?:pattern)`. The library now handles this automatically in `buildLineStartsWithRegexSource` and `buildLineStartsAfterRegexSource`.

15. **Large Segment Performance & Debugging Strategy**: When processing large books (1000+ pages), avoid O(n²) algorithms. The library uses a fast-path threshold (1000 pages) to switch from accurate string-search boundary detection to cumulative-offset-based slicing. Even on the iterative path (e.g. debug mode), we **slice only the active window (+padding)** per iteration (never `fullContent.slice(cursorPos)`), to avoid quadratic allocation/GC churn. To diagnose performance bottlenecks: (1) Look for logs with "Using iterative path" or "Using accurate string-search path" with large `pageCount` values, (2) Check `iterations` count in completion logs, (3) Strategic logs are placed at operation boundaries (start/end) NOT inside tight loops to avoid log-induced performance regression.

16. **`maxPages=0` is a hard invariant**: When `maxPages=0`, breakpoint windows must never scan beyond the current page boundary. Relying purely on boundary detection (string search) can fail near page ends for long Arabic text + space joiners, letting the window “see” into the next page and creating multi-page segments. The safe fix is to clamp the breakpoint window to the current page’s end using `boundaryPositions` in breakpoint processing.

17. **`''` breakpoint semantics depend on whether the window is page-bounded vs length-bounded**: `''` means “page boundary fallback”, but it’s intentionally **mode-dependent**:

   - **Page-bounded window (maxPages-driven)**: `''` should “swallow the remainder of the current page” (i.e. break at the **next page boundary**, not at an arbitrary character limit). This prevents accidentally consuming part of the next page when no other breakpoint patterns match.
   - **Length-bounded window (maxContentLength-driven)**: `''` should **not** force an early page-boundary break. In this mode we want the best split *near the length limit* (safe-break fallback → Unicode-safe hard split) even if that means a piece can cross a page boundary.

   Concrete branching (simplified):

   ```ts
   if (breakpoint.pattern === '') {
     if (!isLengthBounded /* i.e. maxContentLength is not the active limiter */) {
       return nextPageBoundaryWithinWindow ?? windowEndPosition; // end-of-page semantics
     }
     return safeBreakNear(windowEndPosition) ?? unicodeSafeHardSplit(windowEndPosition);
   }
   ```

18. **Beware `.only` in test files**: A single `it.only(...)` can mask unrelated failing fixtures for a long time. When debugging, remove `.only` as soon as you have a focused reproduction, and re-run the full suite to catch latent failures.

19. **Tooling gotcha: IDE diagnostics vs actual parser**: If the editor shows parse errors but `bun test` and `bunx biome check` pass, suspect unsaved local edits or stale diagnostics rather than codebase syntax. Always validate with a direct `bunx biome check <file>` before making sweeping “syntax fix” edits.

20. **Content-based page detection fails with overlapping content**: The `computeNextFromIdx` function uses prefix matching to detect page transitions. When page 0 ends with text identical to page 1's prefix, it incorrectly advances `currentFromIdx`. **Fix**: When `maxPages=0`, override content-based detection with position-based detection via `findPageIndexForPosition(cursorPos, boundaryPositions, fromIdx)`. Always trust cumulative offsets over content heuristics for strict page isolation.

21. **Test edge cases with data that TRIGGERS the bug path**: Simple test data often bypasses problematic code paths. Ensure tests: (a) use `maxContentLength` to force sub-page splitting, (b) include enough content to exceed window sizes, (c) create overlapping/duplicate text at page boundaries, (d) verify that segments are actually split (not just checking no crashes).

22. **Debug breakpoint processing with the logger**: Pass a `logger` object with `debug` and `trace` methods to `segmentPages()`. Key logs: `boundaryPositions built` (page boundary byte offsets), `iteration=N` (shows `currentFromIdx`, `cursorPos`, `windowEndPosition` per loop), `Complete` (final segment count).

23. **Navigating `breakpoint-processor.ts`**: Key functions in (approximate) execution order:

   - `applyBreakpoints()` (entry point)
   - `processOversizedSegment()` (main loop)
     - `buildBoundaryPositions()` (precompute page boundary positions)
     - loop iteration:
       - `computeWindowEndIdx()` (page-window end by `maxPages`)
       - `getWindowEndPosition()` / maxPages=0 clamp (compute window end in content-space)
       - `findBreakOffsetForWindow()` → `findBreakPosition()` → `handlePageBoundaryBreak()` / `findPatternBreakPosition()` (select split point)
       - `advanceCursorAndIndex()` (progress)
       - `computeNextFromIdx()` (heuristic) **or** position-based override when `maxPages=0` (see #21)

24. **Page attribution can drift in large-document breakpoint processing**: For ≥`FAST_PATH_THRESHOLD` segments, boundary positions may be derived from cumulative offsets (fast path). If upstream content is modified (e.g. marker stripping or accidental leading-trim), binary-search attribution can classify a piece as starting **before** `currentFromIdx`, inflating `(to - from)` and violating `maxPages`. **Fix**: clamp `actualStartIdx >= currentFromIdx` and re-apply the `maxPages` window using the same ID-span logic as `computeWindowEndIdx(...)` before creating the piece segment.

25. **Offset fast path must respect page-ID span semantics**: `maxPages` in this library is enforced as an **ID span** invariant (`(to ?? from) - from <= maxPages`). For large segments, the offset-based fast path must choose `segEnd` using the same ID-window logic as `computeWindowEndIdx(...)` (not “N pages by index”), otherwise gaps (e.g. `2216 → 2218`) produce illegal spans.

26. **Never `trimStart()` huge fallback content**: `ensureFallbackSegment()` constructs “all pages as one segment” when there are no structural split rules. If this giant content is `trimStart()`’d, cumulative offsets and derived boundary positions become inconsistent, which can lead to incorrect `from/to` attribution and `maxPages` violations that only appear on very large books.

27. **Always test both sides of the fast-path threshold**: Several breakpoint bugs only reproduce at or above `FAST_PATH_THRESHOLD` (1000). Add regressions at `threshold-1` and `threshold` to avoid “works in small unit tests, fails on full books” surprises.

28. **Breakpoint `split` behavior**: The `split: 'at' | 'after'` option for breakpoints controls where the split happens relative to the matched text:
   - `'after'` (default): Match is included in the previous segment
   - `'at'`: Match starts the next segment
   Key implementation details in `findPatternBreakPosition`:
   - Position is calculated as `splitAt ? idx : idx + len`
   - Matches at position 0 are skipped for `split:'at'` to prevent empty first segments
   - Zero-length matches (lookaheads) are always skipped to prevent infinite loops
   - Empty pattern `''` forces `splitAt=false` since page boundaries have no matched text

29. **Unicode safety is the user's responsibility for patterns**: Unlike `findSafeBreakPosition` (which adjusts for grapheme boundaries), pattern-based breaks use the exact position where the user's regex matched. If a pattern matches mid-grapheme, that's a pattern authoring error, not a library bug. The library should NOT silently adjust pattern match positions.

30. **Fast path doesn't affect split behavior**: The offset-based fast path only applies to empty pattern `''` breakpoints (page boundary fallback), and empty patterns force `splitAt=false`. Pattern-based breakpoints with `split:'at'` never engage the fast path.

31. **Whitespace trimming affects split:'at' output**: `createSegment()` trims segment content. With `split:'at'`, if the matched text is whitespace-only, it will be trimmed from the start of the next segment. This is usually desirable for delimiter patterns.

32. **`prefer` semantics with `split:'at'`**: With `prefer:'longer'` + `split:'at'`, the algorithm selects the LAST valid match, maximizing content in the previous segment. This is correct but can be counterintuitive since the resulting previous segment might appear "shorter" than with `split:'after'`.

33. **Multi-agent review synthesis**: Getting implementation reviews from multiple AI models (Claude, GPT, Grok, Gemini) and synthesizing their feedback helps catch issues a single reviewer might miss. Key insight: when reviewers disagree on "critical" issues, investigate the codebase to verify claims before implementing fixes. Some "critical" issues are based on incorrect assumptions about how fast paths or downstream functions work.

34. **`preprocess` option applies transforms before rules**: The `preprocess` array in `SegmentationOptions` applies text transforms to each page's content BEFORE `buildPageMap()` is called. This ensures patterns match on the normalized text. Transforms are: `removeZeroWidth`, `condenseEllipsis`, `fixTrailingWaw`. Each can have `min`/`max` page constraints.

35. **`words` field simplifies word-based breakpoints**: Instead of manually writing `\s+(?:word1|word2|...)` alternations, use `words: ['word1', 'word2']`. The field auto-escapes metacharacters (except `()[]` which are handled by `processPattern`), sorts by length descending, deduplicates, and defaults to `split: 'at'`. Cannot be combined with `pattern` or `regex`. **Empty arrays are filtered out** (no-op), NOT treated as page-boundary fallback like `''`.

36. **`{{newline}}` token for readability**: Instead of `\\n` in breakpoint patterns, use `{{newline}}`. This expands to `\n` and is more readable in JSON configuration files.

37. **Never use decorative separator comments**: Do NOT write comments like `// ============================================================================` or similar ASCII art separators. These waste tokens, add no value, and pollute the codebase. Use simple single-line comments or JSDoc instead.

38. **Never use `require()` in test files**: Always use ES module `import` statements at the top of test files. Do NOT use inline `require()` calls inside test blocks. This ensures consistent module resolution and avoids mixing CommonJS and ESM patterns.

39. **Avoid double-escaping in layered pattern processing**: When patterns pass through multiple processing stages (e.g., `escapeWordsOutsideTokens` → `processPattern`), ensure each character class is escaped exactly once. The `words` field initially had a bug where `()[]` were escaped by `escapeWordsOutsideTokens` and then again by `processPattern`'s `escapeTemplateBrackets`. **Fix**: `escapeWordsOutsideTokens` now escapes metacharacters EXCEPT `()[]`, letting `processPattern` handle those.

40. **Empty arrays vs empty strings have different semantics**: `words: []` should be a no-op (filtered out), not equivalent to `pattern: ''` (page-boundary fallback). When designing APIs with arrays, explicitly decide and document what empty array means vs null/undefined vs explicit empty value.

41. **Whitespace checks should use `/\s/` not `=== ' '`**: When checking "is this character whitespace?" use `/\s/.test(char)` to catch spaces, tabs, newlines, and other unicode whitespace. The `removeZeroWidth` space mode initially only checked `=== ' '`, causing unwanted spaces after newlines.

42. **Use `assertNever` for exhaustive switches**: When switching on union types (like `PreprocessTransform`), add a `default` case that calls `assertNever(x: never)` which throws. TypeScript will error at compile time if a new union member is added but not handled.

43. **`words` field matches partial words**: The `words` field generates `\s+(?:word1|word2)` which matches text *starting with* the word, not complete words. `words: ['ثم']` will match `ثمامة` (a name). **Solution**: Add trailing space for whole-word matching: `words: ['ثم ']`.

44. **Breakpoints are only applied when content EXCEEDS limits**: Per the documented behavior, breakpoints split segments that exceed `maxPages` or `maxContentLength`. If content fits within both limits, breakpoints should NOT be applied. Tests that expect breakpoint splits on already-compliant content have incorrect expectations.

45. **`maxPages=0` + `maxContentLength` interaction is subtle**: When both constraints are set:
   - Check if remaining content on the CURRENT PAGE fits within `maxContentLength`
   - If yes AND remaining content spans multiple pages: create segment for current page, advance to next page
   - If no (content exceeds length): apply breakpoints as normal
   - Bug symptom: adding a second page caused first page to be over-split into tiny fragments (e.g., 147, 229, 65 chars instead of ~1800 chars)
   - Root cause: code checked ALL remaining content's span (crossing pages) instead of just current page's content

46. **Minimal regression tests must trigger the bug path**: When fixing bugs, create tests that:
   - Use realistic data sizes that exceed thresholds
   - Include the specific constraint combination that triggered the bug (e.g., `maxPages=0` + `maxContentLength` + multiple pages)
   - Assert on segment COUNT and LENGTHS, not just "no crashes"
   - Would FAIL without the fix (tiny fragments) and PASS with it (normal segments)

47. **Existing test expectations can be wrong**: When a fix causes existing tests to fail, investigate whether the test expectation matches documented behavior. The test `should not merge the pages when content overlaps between pages` expected 4 segments but the correct count is 3 (per documented semantics). Update tests to match correct behavior, don't revert fixes to match incorrect tests.

48. **The "adding content changes behavior" smell**: If adding unrelated content (like a second page) dramatically changes how the first page is processed, suspect incorrect span/window calculations. The fix pattern: ensure window calculations are scoped to the CURRENT context (current page) not the ORIGINAL context (all remaining content).

49. **Use `trimStart()` not `trim()` for user-provided patterns with semantic whitespace**: When processing user-provided patterns like the `words` field, only strip leading whitespace (likely accidental). Trailing whitespace may be intentional for whole-word matching (e.g., `'بل '` should match only the standalone word, not words starting with `بل` like `بلغ`). **Bug symptom**: `words: ['بل ']` matched `بلغ` because `.trim()` stripped the trailing space to just `بل`. **Fix**: Use `.trimStart()` to preserve trailing whitespace.

50. **When expected boundaries exceed segment length, trust content matches**: If `expectedBoundary >= remainingContent.length`, any deviation-based validation is meaningless. In this case the boundary search must scan the full segment content and rank candidates without a distance constraint. Otherwise early valid page starts can be missed and page attribution will drift.

51. **Infer start offset from the first boundary when necessary**: If the initial boundary search fails right after a structural split, rerun a relaxed search to find the true page start and infer `startOffsetInFromPage`. This corrects the baseline for all subsequent boundary estimates.

52. **Windowed boundary searches can be wrong when offsets drift**: If the approximate offset is skewed (e.g., repeated line-start markers), a windowed scan may miss the real boundary. A full-content scan is required to recover early matches.

53. **Harden maxPages=0 with targeted tests**: Add tests that hit the failure modes: segment starts at page boundary with repeated marker, very short pages (< 100 chars), minimal prefix lengths (15 chars), multiple candidate prefixes in content, tiny tail segments after structural splits, and fast-path threshold transitions (999 vs 1000 pages).

54. **Beware trusting `segment.to` in validation**: When validating `maxPages` violations, do NOT rely solely on `segment.to` if it exists. A segment might claim to end on page X (via `segment.to`) but its content physically matches text on page Y. If `maxPages=0`, trusting `segment.to` hides the violation. Always check the physical match location (`actualToId`) against the constraint, regardless of what the segment claims.

55. **Duplicate `case` labels in manual merges**: When applying fixes suggested by AI or manual merges, check surrounding code for duplicate `case` statements. JavaScript switch statements with duplicate cases are syntax errors (strict mode) or unreachable code. Validation errors usually catch this, but careful reading prevents it.

56. **Linting vs Checks**: `bunx biome check` is strict. Complexity limits (max 15/18) force you to decompose functions. If you receive a complexity error, extract the complex logic (e.g., switch cases, specific validation checks) into standalone helper functions.

57. **Validation Hints Specificity**: Generic error hints like "Check segmenter.ts" are unhelpful. Provide specific file names and logical components (e.g., "Check maxPages windowing in breakpoint-processor.ts"). User-friendly validation reports guide debugging much faster than "Something is wrong".

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

| Token | Constant | Pattern | Example |
|-------|----------|---------|---------|
| `{{tarqim}}` | `Token.TARQIM` | Arabic punctuation | `؛` `.` |
| `{{basmalah}}` | `Token.BASMALAH` | "بسم الله" | بسم الله |
| `{{bab}}` | `Token.BAB` | "باب" (chapter) | باب الإيمان |
| `{{fasl}}` | `Token.FASL` | "فصل/مسألة" | فصل: |
| `{{kitab}}` | `Token.KITAB` | "كتاب" (book) | كتاب الصلاة |
| `{{naql}}` | `Token.NAQL` | Narrator phrases | حدثنا |
| `{{raqm}}` | `Token.RAQM` | Single Arabic digit | ٥ |
| `{{raqms}}` | `Token.RAQMS` | Multiple Arabic digits | ٧٥٦٣ |
| `{{num}}` | `Token.NUM` | Single ASCII digit | 5 |
| `{{nums}}` | `Token.NUMS` | Multiple ASCII digits | 123 |
| `{{dash}}` | `Token.DASH` | Dash variants | - – — ـ |
| `{{harf}}` | `Token.HARF` | Single Arabic letter | أ |
| `{{harfs}}` | `Token.HARFS` | Spaced letters | د ت س |
| `{{rumuz}}` | `Token.RUMUZ` | Source abbreviations | خت ٤ |
| `{{bullet}}` | `Token.BULLET` | Bullet points | • * ° |
| `{{newline}}` | `Token.NEWLINE` | Newline character | `\n` |
| `{{numbered}}` | `Token.NUMBERED` | `{{raqms}} {{dash}} ` | ٧٥٦٣ - |
| `{{hr}}` | `Token.HR` | Horizontal rule | ـــــــــــ |

### Token Constants (Better DX)

```typescript
import { Token, withCapture } from 'flappa-doormal';

// Use constants instead of strings
{ lineStartsWith: [Token.KITAB, Token.BAB] }

// Named captures with withCapture helper
const pattern = withCapture(Token.RAQMS, 'num') + ' ' + Token.DASH + ' ';
// → '{{raqms:num}} {{dash}} '
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
- Implemented in `src/segmentation/segmenter-rule-utils.ts` match filtering.

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

## Debugging Tips

### Reading Validation Reports

`validateSegments(pages, options, segments)` returns a structured report for attribution and `maxPages` issues. Use it to quickly localize bugs without re-running segmentation.

**Key fields:**
- `summary.errors` / `summary.warnings`: Use to decide if the bug is a hard failure or a suspected edge case.
- `issues[].type`: The failure class (see below).
- `issues[].segmentIndex`: Which segment to inspect in output.
- `issues[].expected` / `issues[].actual`: Where attribution diverged.
- `issues[].pageContext`: Matching page preview + `matchIndex` (if found).
- `issues[].hint`: Direct pointer to likely culprit code path.

**Issue types and next steps:**
- `max_pages_violation`: Segment spans too many pages. Check breakpoint windowing in `breakpoint-processor.ts` and boundary logic in `breakpoint-utils.ts`.
- `page_attribution_mismatch`: Content matched a different page than `segment.from`. Focus on `buildBoundaryPositions()` and `findPageStartNearExpectedBoundary()`.
- `content_not_found`: Segment content not found in any page. Compare preprocessing, `pageJoiner`, and trimming behavior.
- `page_not_found`: Segment `from` is not in input pages; validate page IDs and input ordering.

### Page Boundary Detection Issues

If `maxPages=0` produces merged segments when pages have identical prefixes or duplicated content:
- Check `buildCumulativeOffsets()` for correct positions
- Trace `findPageStartNearExpectedBoundary` candidates
- Verify matches are within `MAX_DEVIATION` (2000 chars) of expected boundary

Key functions: `applyBreakpoints()` → `processOversizedSegment()` → `findBreakpointWindowEndPosition()` → `handlePageBoundaryBreak()`

### General Debugging

- Pass `logger` with `debug`/`trace` methods to `segmentPages()` for detailed logs
- Check `boundaryPositions built` log for page boundary byte offsets
- Check `iteration=N` logs for `currentFromIdx`, `cursorPos`, `windowEndPosition` per loop

## Known Issues

- **Binary Search Gap (Theoretical)**: `findBoundaryIdForOffset` returns `undefined` if the search offset falls exactly on a joiner character (e.g., a space or newline) between two pages. This is mathematically correct (the gap belongs to neither page) but may cause validation errors if a segment consists _only_ of such a gap or matches content starting/ending strictly within the gap. We have marked this as "accept" behavior for now, with a documented skipped test case.


