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
    ├── index.ts                # Module exports
    ├── types.ts                # TypeScript type definitions for rules/segments
    ├── segmenter.ts            # Core segmentation engine (segmentPages)
    ├── tokens.ts               # Token definitions and expansion logic
    ├── fuzzy.ts                # Diacritic-insensitive matching utilities
    ├── html.ts                 # HTML utilities (stripHtmlTags)
    ├── match-utils.ts          # Extracted match processing utilities
    ├── segmenter.test.ts       # Core test suite (66 tests)
    ├── segmenter.bukhari.test.ts # Real-world test cases
    └── match-utils.test.ts     # Utility function tests (30 tests)
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
   - `groupBySpanAndFilter()` - Handle maxSpan grouping
   - `anyRuleAllowsId()` - Check if page passes rule constraints

4. **`fuzzy.ts`** - Arabic text normalization
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
2. **Biome linting** - Max complexity 15 per function
3. **JSDoc comments** - All exported functions documented
4. **Test coverage** - 96 tests, all passing

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

### Architecture Insights

- **Declarative > Imperative**: Users describe patterns, library handles regex
- **Composability**: Tokens can be combined freely with `:name` captures
- **Fail gracefully**: Unknown tokens are left as-is, allowing partial templates
