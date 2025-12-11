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

```
src/
├── index.ts                    # Main entry point and exports
└── segmentation/
    ├── types.ts                # TypeScript type definitions for rules/segments
    ├── segmenter.ts            # Core segmentation engine (segmentPages, applyBreakpoints)
    ├── breakpoint-utils.ts     # Extracted breakpoint processing utilities (NEW)
    ├── tokens.ts               # Token definitions and expansion logic  
    ├── fuzzy.ts                # Diacritic-insensitive matching utilities
    ├── html.ts                 # HTML utilities (stripHtmlTags)
    ├── textUtils.ts            # Text processing utilities
    ├── match-utils.ts          # Extracted match processing utilities
    ├── segmenter.test.ts       # Core test suite (150+ tests including breakpoints)
    ├── segmenter.bukhari.test.ts # Real-world test cases
    ├── breakpoint-utils.test.ts # Breakpoint utility tests (42 tests)
    ├── tokens.test.ts          # Token expansion tests
    ├── fuzzy.test.ts           # Fuzzy matching tests
    ├── textUtils.test.ts       # Text utility tests
    └── match-utils.test.ts     # Utility function tests

test/
├── 2576.json                   # Test data for book 2576 (Sahih Bukhari)
└── 2588.json                   # Test data for book 2588 (Al-Mughni)

docs/
├── checkpoints/                # AI agent handoff documentation
│   └── 2025-12-09-handoff.md
└── reviews/                    # Performance analysis reports
    └── 2025-12-10/
```

### Core Components

1. **`segmentPages(pages, options)`** - Main entry point
   - Takes array of `{id, content}` pages and split rules
   - Returns array of `{content, from, to?, meta?}` segments

2. **`tokens.ts`** - Template system
   - `TOKEN_PATTERNS` - Map of token names to regex patterns
   - `expandTokensWithCaptures()` - Expands `{{token:name}}` syntax
   - Supports fuzzy transform for diacritic-insensitive matching

3. **`match-utils.ts`** - Extracted utilities (for testability)
   - `extractNamedCaptures()` - Get named groups from regex match
   - `filterByConstraints()` - Apply min/max page filters
   - `anyRuleAllowsId()` - Check if page passes rule constraints

4. **`breakpoint-utils.ts`** - Breakpoint processing utilities (NEW)
   - `normalizeBreakpoint()` - Convert string to BreakpointRule object
   - `isPageExcluded()` - Check if page is in exclude list
   - `isInBreakpointRange()` - Validate page against min/max/exclude constraints
   - `buildExcludeSet()` - Create Set from PageRange[] for O(1) lookups
   - `createSegment()` - Create segment with optional to/meta fields
   - `expandBreakpoints()` - Expand patterns with pre-compiled regexes
   - `findActualEndPage()` - Search backwards for ending page by content
   - `findBreakPosition()` - Find break position using breakpoint patterns
   - `hasExcludedPageInRange()` - Check if range contains excluded pages
   - `findNextPagePosition()` - Find next page content position
   - `findPatternBreakPosition()` - Find pattern match by preference

5. **`fuzzy.ts`** - Arabic text normalization
   - `makeDiacriticInsensitive()` - Generate regex that ignores diacritics

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

### Breakpoints Post-Processing Algorithm

The `breakpoints` option provides a post-processing mechanism for limiting segment size. Unlike the deprecated `maxSpan` (which was per-rule), breakpoints runs AFTER all structural rules.

**API Options:**
```typescript
interface SegmentationOptions {
  rules: SplitRule[];
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
    { lineStartsWith: ['{{basmalah}}'], split: 'at' },
    { lineStartsWith: ['{{bab}}'], split: 'at', meta: { type: 'chapter' } },
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
4. **Test coverage** - 222 tests across 7 files

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

### Architecture Insights

- **Declarative > Imperative**: Users describe patterns, library handles regex
- **Composability**: Tokens can be combined freely with `:name` captures
- **Fail gracefully**: Unknown tokens are left as-is, allowing partial templates
- **Post-process > Inline**: Breakpoints runs after rules, avoiding conflicts
- **Dependency injection for testability**: `breakpoint-utils.ts` accepts a `PatternProcessor` function instead of importing `processPattern` directly, enabling independent testing without mocking

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
| `{{numbered}}` | Composite: `{{raqms}} {{dash}}` | ٧٥٦٣ - |

**Named captures**: Add `:name` suffix to capture into `meta`:
```typescript
'{{raqms:hadithNum}} {{dash}}' 
// → segment.meta.hadithNum = "٧٥٦٣"
```

