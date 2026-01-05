# flappa-doormal

<p align="center">
  <img src="icon.png" alt="flappa-doormal" width="128" height="128" />
</p>

<p align="center">
  <strong>Declarative Arabic text segmentation library</strong><br/>
  Split pages of content into logical segments using human-readable patterns.
</p>

<p align="center">
  <a href="https://flappa-doormal.surge.sh">🚀 <strong>Live Demo</strong></a> •
  <a href="https://www.npmjs.com/package/flappa-doormal">📦 npm</a> •
  <a href="https://github.com/ragaeeb/flappa-doormal">📚 GitHub</a>
</p>

[![wakatime](https://wakatime.com/badge/user/a0b906ce-b8e7-4463-8bce-383238df6d4b/project/384fa29d-72e8-4078-980f-45d363f10507.svg)](https://wakatime.com/badge/user/a0b906ce-b8e7-4463-8bce-383238df6d4b/project/384fa29d-72e8-4078-980f-45d363f10507)
[![Node.js CI](https://github.com/ragaeeb/flappa-doormal/actions/workflows/build.yml/badge.svg)](https://github.com/ragaeeb/flappa-doormal/actions/workflows/build.yml) ![GitHub License](https://img.shields.io/github/license/ragaeeb/flappa-doormal)
![GitHub Release](https://img.shields.io/github/v/release/ragaeeb/flappa-doormal)
[![Size](https://deno.bundlejs.com/badge?q=flappa-doormal@latest)](https://bundlejs.com/?q=flappa-doormal%40latest)
![typescript](https://badgen.net/badge/icon/typescript?icon=typescript&label&color=blue)
![npm](https://img.shields.io/npm/v/flappa-doormal)
![npm](https://img.shields.io/npm/dm/flappa-doormal)
![GitHub issues](https://img.shields.io/github/issues/ragaeeb/flappa-doormal)
![GitHub stars](https://img.shields.io/github/stars/ragaeeb/flappa-doormal?style=social)
[![codecov](https://codecov.io/gh/ragaeeb/flappa-doormal/graph/badge.svg?token=RQ2BV4M9IS)](https://codecov.io/gh/ragaeeb/flappa-doormal)
[![npm version](https://badge.fury.io/js/flappa-doormal.svg)](https://badge.fury.io/js/flappa-doormal)

## Why This Library?

### The Problem

Working with Arabic hadith and Islamic text collections requires splitting continuous text into segments (individual hadiths, chapters, verses). This traditionally means:

- Writing complex Unicode regex patterns: `^[\u0660-\u0669]+\s*[-–—ـ]\s*`
- Handling diacritic variations: `حَدَّثَنَا` vs `حدثنا`
- Managing multi-page spans and page boundary tracking
- Manually extracting hadith numbers, volume/page references

### What Exists

- **General regex libraries**: Don't understand Arabic text nuances
- **NLP tokenizers**: Overkill for pattern-based segmentation
- **Manual regex**: Error-prone, hard to maintain, no metadata extraction

### The Solution

**flappa-doormal** provides:

✅ **Readable templates**: `{{raqms}} {{dash}}` instead of cryptic regex  
✅ **Named captures**: `{{raqms:hadithNum}}` auto-extracts to `meta.hadithNum`  
✅ **Fuzzy matching**: Auto-enabled for `{{bab}}`, `{{kitab}}`, `{{basmalah}}`, `{{fasl}}`, `{{naql}}` (override with `fuzzy: false`)  
✅ **Content limits**: `maxPages` and `maxContentLength` (safety-hardened) control segment size  
✅ **Page tracking**: Know which page each segment came from  
✅ **Declarative rules**: Describe *what* to match, not *how*

## Installation

```bash
npm install flappa-doormal
# or
bun add flappa-doormal
# or
yarn add flappa-doormal
```

## Quick Start

```typescript
import { segmentPages } from 'flappa-doormal';

// Your pages from a hadith book
const pages = [
  { id: 1, content: '٦٦٩٦ - حَدَّثَنَا أَبُو بَكْرٍ عَنِ النَّبِيِّ...' },
  { id: 1, content: '٦٦٩٧ - أَخْبَرَنَا عُمَرُ قَالَ...' },
  { id: 2, content: '٦٦٩٨ - حَدَّثَنِي مُحَمَّدٌ...' },
];

const segments = segmentPages(pages, {
  rules: [{
    lineStartsAfter: ['{{raqms:num}} {{dash}} '],
    split: 'at',
  }]
});

// Result:
// [
//   { content: 'حَدَّثَنَا أَبُو بَكْرٍ عَنِ النَّبِيِّ...', from: 1, meta: { num: '٦٦٩٦' } },
//   { content: 'أَخْبَرَنَا عُمَرُ قَالَ...', from: 1, meta: { num: '٦٦٩٧' } },
//   { content: 'حَدَّثَنِي مُحَمَّدٌ...', from: 2, meta: { num: '٦٦٩٨' } }
// ]
```

## Features

### 1. Template Tokens

Replace regex with readable tokens:

| Token | Matches | Regex Equivalent |
|-------|---------|------------------|
| `{{raqms}}` | Arabic-Indic digits | `[\\u0660-\\u0669]+` |
| `{{raqm}}` | Single Arabic digit | `[\\u0660-\\u0669]` |
| `{{dash}}` | Dash variants | `[-–—ـ]` |
| `{{harf}}` | Arabic letter | `[أ-ي]` |
| `{{harfs}}` | Single-letter codes separated by spaces | `[أ-ي](?:\s+[أ-ي])*` |
| `{{rumuz}}` | Source abbreviations (rijāl/takhrīj rumuz), incl. multi-code blocks | e.g. `خت ٤`, `خ سي`, `خ فق`, `د ت سي ق`, `دت عس ق` |
| `{{numbered}}` | Hadith numbering `٢٢ - ` | `{{raqms}} {{dash}} ` |
| `{{fasl}}` | Section markers | `فصل\|مسألة` |
| `{{tarqim}}` | Punctuation marks | `[.!?؟؛]` |
| `{{bullet}}` | Bullet points | `[•*°]` |
| `{{naql}}` | Narrator phrases | `حدثنا\|أخبرنا\|...` |
| `{{kitab}}` | "كتاب" (book) | `كتاب` |
| `{{bab}}` | "باب" (chapter) | `باب` |
| `{{basmalah}}` | "بسم الله" | `بسم الله` |

### 2. Named Capture Groups

Extract metadata automatically with the `{{token:name}}` syntax:

```typescript
// Capture hadith number
{ template: '^{{raqms:hadithNum}} {{dash}} ' }
// Result: meta.hadithNum = '٦٦٩٦'

// Capture volume and page
{ template: '^{{raqms:vol}}/{{raqms:page}} {{dash}} ' }
// Result: meta.vol = '٣', meta.page = '٤٥٦'

// Capture rest of content
{ template: '^{{raqms:num}} {{dash}} {{:text}}' }
// Result: meta.num = '٦٦٩٦', meta.text = 'حَدَّثَنَا أَبُو بَكْرٍ'
```

### 3. Fuzzy Matching (Diacritic-Insensitive)

Match Arabic text regardless of harakat:

```typescript
const rules = [{
  fuzzy: true,
  lineStartsAfter: ['{{kitab:book}} '],
  split: 'at',
}];

// Matches both:
// - 'كِتَابُ الصلاة' (with diacritics)
// - 'كتاب الصيام' (without diacritics)
```

### 4. Pattern Types

| Type | Marker in content? | Use case |
|------|-------------------|----------|
| `lineStartsWith` | ✅ Included | Keep marker, segment at boundary |
| `lineStartsAfter` | ❌ Excluded | Strip marker, capture only content |
| `lineEndsWith` | ✅ Included | Match patterns at end of line |
| `template` | Depends | Custom pattern with full control |
| `regex` | Depends | Raw regex for complex cases |

#### Building UIs with Pattern Type Keys

The library exports `PATTERN_TYPE_KEYS` (a const array) and `PatternTypeKey` (a type) for building UIs that let users select pattern types:

```typescript
import { PATTERN_TYPE_KEYS, type PatternTypeKey } from 'flappa-doormal';

// PATTERN_TYPE_KEYS = ['lineStartsWith', 'lineStartsAfter', 'lineEndsWith', 'template', 'regex']

// Build a dropdown/select
PATTERN_TYPE_KEYS.map(key => <option value={key}>{key}</option>)

// Type-safe validation
const isPatternKey = (k: string): k is PatternTypeKey =>
  (PATTERN_TYPE_KEYS as readonly string[]).includes(k);
```

### 4.1 Page-start Guard (avoid page-wrap false positives)

When matching at line starts (e.g., `{{naql}}`), a new page can begin with a marker that is actually a **continuation** of the previous page (page wrap), not a true new segment.

Use `pageStartGuard` to allow a rule to match at the start of a page **only if** the previous page’s last non-whitespace character matches a pattern (tokens supported):

```typescript
const segments = segmentPages(pages, {
  rules: [{
    fuzzy: true,
    lineStartsWith: ['{{naql}}'],
    split: 'at',
    // Only allow a split at the start of a new page if the previous page ended with sentence punctuation:
    pageStartGuard: '{{tarqim}}'
  }]
});
```

This guard applies **only at page starts**. Mid-page line starts are unaffected.

### 5. Auto-Escaping Brackets

In `lineStartsWith`, `lineStartsAfter`, `lineEndsWith`, and `template` patterns, parentheses `()` and square brackets `[]` are **automatically escaped**. This means you can write intuitive patterns without manual escaping:

```typescript
// Write this (clean and readable):
{ lineStartsAfter: ['({{harf}}): '], split: 'at' }

// Instead of this (verbose escaping):
{ lineStartsAfter: ['\\({{harf}}\\): '], split: 'at' }
```

**Important**: Brackets inside `{{tokens}}` are NOT escaped - token patterns like `{{harf}}` which expand to `[أ-ي]` work correctly.

For full regex control (character classes, capturing groups), use the `regex` pattern type which does NOT auto-escape:

```typescript
// Character class [أب] matches أ or ب
{ regex: '^[أب] ', split: 'at' }

// Capturing group (test|text) matches either
{ regex: '^(test|text) ', split: 'at' }

// Named capture groups extract metadata from raw regex too!
{ regex: '^(?<num>[٠-٩]+)\\s+[أ-ي\\s]+:\\s*(.+)' }
// meta.num = matched number, content = captured (.+) group
```

### 6. Page Constraints

Limit rules to specific page ranges:

```typescript
{
  lineStartsWith: ['## '],
  split: 'at',
  min: 10,    // Only pages 10+
  max: 100,   // Only pages up to 100
}
```

### 7. Max Content Length (Safety Hardened)

Split oversized segments based on character count:

```typescript
{
  maxContentLength: 500, // Split after 500 characters
  prefer: 'longer',      // Try to fill the character bucket
  breakpoints: ['\\.'], // Recommended: split on punctuation within window
}
```

The library implements **safety hardening** for character-based splits:
- **Safe Fallback**: If no breakpoint matches, it searches backward up to 100 characters for a delimiter (whitespace or punctuation) to avoid chopping words.
- **Unicode Safety**: Automatically prevents splitting inside Unicode surrogate pairs (e.g., emojis), preventing text corruption.
- **Validation**: `maxContentLength` must be at least **50**.

### 8. Advanced Structural Filters

Refine rule matching with page-specific constraints:

```typescript
{
  lineStartsWith: ['### '],
  split: 'at',
  // Range constraints
  min: 10,    // Only match on pages 10 and above
  max: 500,   // Only match on pages 500 and below
  exclude: [50, [100, 110]], // Skip page 50 and range 100-110

  // Negative lookahead: skip rule if content matches this pattern
  // (e.g. skip chapter marker if it appears inside a table/list)
  skipWhen: '^\s*- ', 
}
```

### 9. Debugging & Logging

Pass an optional `logger` to trace segmentation decisions or enable `debug` to attach match metadata to segments:

```typescript
const segments = segmentPages(pages, {
  rules: [...],
  debug: true, // Attaches .meta.debug with regex and match indices
  logger: {
    debug: (msg, data) => console.log(`[DEBUG] ${msg}`, data),
    info: (msg, data) => console.info(`[INFO] ${msg}`, data),
    warn: (msg, data) => console.warn(`[WARN] ${msg}`, data),
    error: (msg, data) => console.error(`[ERROR] ${msg}`, data),
  }
});
```

### 10. Page Joiners

Control how text from different pages is stitched together:

```typescript
// Default: space ' ' joiner
// Result: "...end of page 1. Start of page 2..."
segmentPages(pages, { pageJoiner: 'space' });

// Result: "...end of page 1.\nStart of page 2..."
segmentPages(pages, { pageJoiner: 'newline' });
```

### 11. Breakpoint Preferences

When a segment exceeds `maxPages` or `maxContentLength`, breakpoints split it at the "best" available match:

```typescript
{
  maxPages: 1, // Minimum segment size (page span)
  breakpoints: ['{{tarqim}}'],
  
  // 'longer' (default): Greedy. Finds the match furthest in the window.
  // Result: Segments stay close to the max limit.
  prefer: 'longer', 

  // 'shorter': Conservative. Finds the first available match.
  // Result: Segments split as early as possible.
  prefer: 'shorter',
}
```

### 12. Occurrence Filtering

Control which matches to use:

```typescript
{
  lineEndsWith: ['\\.'],
  split: 'after',
  occurrence: 'last',  // Only split at LAST period on page
}
```

## Use Cases

### Simple Hadith Segmentation

Use `{{numbered}}` for the common "number - content" format:

```typescript
const segments = segmentPages(pages, {
  rules: [{
    lineStartsAfter: ['{{numbered}}'],
    split: 'at',
    meta: { type: 'hadith' }
  }]
});

// Matches: ٢٢ - حدثنا, ٦٦٩٦ – أخبرنا, etc.
// Content starts AFTER the number and dash
```

### Hadith Segmentation with Number Extraction

For capturing the hadith number, use explicit capture syntax:

```typescript
const segments = segmentPages(pages, {
  rules: [{
    lineStartsAfter: ['{{raqms:hadithNum}} {{dash}} '],
    split: 'at',
    meta: { type: 'hadith' }
  }]
});

// Each segment has:
// - content: The hadith text (without number prefix)
// - from/to: Page range
// - meta: { type: 'hadith', hadithNum: '٦٦٩٦' }
```

### Volume/Page Reference Extraction

```typescript
const segments = segmentPages(pages, {
  rules: [{
    lineStartsAfter: ['{{raqms:vol}}/{{raqms:page}} {{dash}} '],
    split: 'at'
  }]
});

// meta: { vol: '٣', page: '٤٥٦' }
```

### Chapter Detection with Fuzzy Matching

```typescript
const segments = segmentPages(pages, {
  rules: [{
    fuzzy: true,
    lineStartsAfter: ['{{kitab:book}} '],
    split: 'at',
    meta: { type: 'chapter' }
  }]
});

// Matches "كِتَابُ" or "كتاب" regardless of diacritics
```

### Naql (Transmission) Phrase Detection

```typescript
const segments = segmentPages(pages, {
  rules: [{
    fuzzy: true,
    lineStartsWith: ['{{naql:phrase}}'],
    split: 'at'
  }]
});

// meta.phrase captures which narrator phrase was matched:
// 'حدثنا', 'أخبرنا', 'حدثني', etc.
```

### Mixed Captured and Non-Captured Tokens

```typescript
// Only capture the number, not the letter
const segments = segmentPages(pages, {
  rules: [{
    lineStartsWith: ['{{raqms:num}} {{harf}} {{dash}} '],
    split: 'at'
  }]
});

// Input: '٥ أ - البند الأول'
// meta: { num: '٥' }  // harf not captured (no :name suffix)
```

### Narrator Abbreviation Codes

Use `{{rumuz}}` for matching rijāl/takhrīj source abbreviations (common in narrator biography books and takhrīj notes):

```typescript
const segments = segmentPages(pages, {
  rules: [{
    lineStartsAfter: ['{{raqms:num}} {{rumuz}}:'],
    split: 'at'
  }]
});

// Matches: ١١١٨ ع: ...   /   ١١١٨ خ سي: ...  /  ١١١٨ خ فق: ...
// meta: { num: '١١١٨' }
// content: '...' (rumuz stripped)
```

**Supported codes**: Single-letter (`ع`, `خ`, `م`, `د`, etc.), two-letter (`خت`, `عس`, `سي`, etc.), digit `٤`, and the word `تمييز` (used in jarḥ wa taʿdīl books).

> **Note**: Single-letter rumuz like `ع` are only matched when they appear as standalone codes, not as the first letter of words like `عَن`. The pattern is diacritic-safe.

If your data uses *only single-letter codes separated by spaces* (e.g., `د ت س ي ق`), you can also use `{{harfs}}`.

## Analysis Helpers (no LLM required)

Use `analyzeCommonLineStarts(pages)` to discover common line-start signatures across a book, useful for rule authoring:

```typescript
import { analyzeCommonLineStarts } from 'flappa-doormal';

const patterns = analyzeCommonLineStarts(pages);
// [{ pattern: "{{numbered}}", count: 1234, examples: [...] }, ...]
```

You can control **what gets analyzed** and **how results are ranked**:

```typescript
import { analyzeCommonLineStarts } from 'flappa-doormal';

// Top 20 most common line-start signatures (by frequency)
const topByCount = analyzeCommonLineStarts(pages, {
  sortBy: 'count',
  topK: 20,
});

// Only analyze markdown H2 headings (lines beginning with "##")
// This shows what comes AFTER the heading marker (e.g. "## {{bab}}", "## {{numbered}}\\[", etc.)
const headingVariants = analyzeCommonLineStarts(pages, {
  lineFilter: (line) => line.startsWith('##'),
  sortBy: 'count',
  topK: 40,
});

// Support additional prefix styles without changing library code
// (e.g. markdown blockquotes ">> ..." + headings)
const quotedHeadings = analyzeCommonLineStarts(pages, {
  lineFilter: (line) => line.startsWith('>') || line.startsWith('#'),
  prefixMatchers: [/^>+/u, /^#+/u],
  sortBy: 'count',
  topK: 40,
});
```

Key options:
- `sortBy`: `'specificity'` (default) or `'count'` (highest frequency first)
- `lineFilter`: restrict which lines are counted (e.g. only headings)
- `prefixMatchers`: consume syntactic prefixes (default includes headings via `/^#+/u`) so you can see variations *after* the prefix
- `normalizeArabicDiacritics`: `true` by default (helps token matching like `وأَخْبَرَنَا` → `{{naql}}`)
- `whitespace`: how whitespace is represented in returned patterns:
  - `'regex'` (default): uses `\\s*` placeholders between tokens
  - `'space'`: uses literal single spaces (`' '`) between tokens (useful if you don't want `\\s` to later match newlines when reusing these patterns)

**Note on brackets in returned patterns**:
- `analyzeCommonLineStarts()` returns **template-like signatures**, not “ready-to-run regex”.
- It intentionally **does not escape literal `()` / `[]`** in the returned `pattern` (e.g. `(ح)` stays `(ح)`).
- If you paste these signatures into `lineStartsWith` / `lineStartsAfter` / `template`, that’s fine: those template pattern types **auto-escape `()[]`** outside `{{tokens}}`.
- If you paste them into a raw `regex` rule, you may need to escape literal brackets yourself.

### Repeating Sequence Analysis (continuous text)

For texts without line breaks (continuous prose), use `analyzeRepeatingSequences()`:

```typescript
import { analyzeRepeatingSequences } from 'flappa-doormal';

const patterns = analyzeRepeatingSequences(pages, {
  minElements: 2,
  maxElements: 4,
  minCount: 3,
  topK: 20,
});
// [{ pattern: "{{naql}}\\s*{{harf}}", count: 42, examples: [...] }, ...]
```

Key options:
- `minElements` / `maxElements`: N-gram size range (default 1-3)
- `minCount`: Minimum occurrences to include (default 3)
- `topK`: Maximum patterns to return (default 20)
- `requireToken`: Only patterns containing `{{tokens}}` (default true)
- `normalizeArabicDiacritics`: Ignore diacritics when matching (default true)

## Analysis → Segmentation Workflow

Use analysis functions to discover patterns, then pass to `segmentPages()`.

### Example A: Continuous Text (No Punctuation)

For prose-like text without structural line breaks:

```typescript
import { analyzeRepeatingSequences, segmentPages, type Page } from 'flappa-doormal';

// Continuous Arabic text with narrator phrases
const pages: Page[] = [
  { id: 1, content: 'حدثنا أحمد بن محمد عن عمر قال سمعت النبي حدثنا خالد بن زيد عن علي' },
  { id: 2, content: 'حدثنا سعيد بن جبير عن ابن عباس أخبرنا يوسف عن أنس' },
];

// Step 1: Discover repeating patterns
const patterns = analyzeRepeatingSequences(pages, { minCount: 2, topK: 10 });
// [{ pattern: '{{naql}}', count: 5, examples: [...] }, ...]

// Step 2: Build rules from discovered patterns
const rules = patterns.filter(p => p.count >= 3).map(p => ({
  lineStartsWith: [p.pattern],
  split: 'at' as const,
  fuzzy: true,
}));

// Step 3: Segment
const segments = segmentPages(pages, { rules });
// [{ content: 'حدثنا أحمد بن محمد عن عمر قال سمعت النبي', from: 1 }, ...]
```

### Example B: Structured Text (With Numbering)

For hadith-style numbered entries:

```typescript
import { analyzeCommonLineStarts, segmentPages, type Page } from 'flappa-doormal';

// Numbered hadith text
const pages: Page[] = [
  { id: 1, content: '٦٦٩٦ - حَدَّثَنَا أَبُو بَكْرٍ عَنِ النَّبِيِّ\n٦٦٩٧ - أَخْبَرَنَا عُمَرُ قَالَ' },
  { id: 2, content: '٦٦٩٨ - حَدَّثَنِي مُحَمَّدٌ عَنْ عَائِشَةَ' },
];

// Step 1: Discover common line-start patterns
const patterns = analyzeCommonLineStarts(pages, { topK: 10, minCount: 2 });
// [{ pattern: '{{raqms}}\\s*{{dash}}', count: 3, examples: [...] }, ...]

// Step 2: Build rules (add named capture for hadith number)
const topPattern = patterns[0]?.pattern ?? '{{raqms}} {{dash}} ';
const rules = [{
  lineStartsAfter: [topPattern.replace('{{raqms}}', '{{raqms:num}}')],
  split: 'at' as const,
  meta: { type: 'hadith' }
}];

// Step 3: Segment
const segments = segmentPages(pages, { rules });
// [
//   { content: 'حَدَّثَنَا أَبُو بَكْرٍ...', from: 1, meta: { type: 'hadith', num: '٦٦٩٦' } },
//   { content: 'أَخْبَرَنَا عُمَرُ قَالَ', from: 1, meta: { type: 'hadith', num: '٦٦٩٧' } },
//   { content: 'حَدَّثَنِي مُحَمَّدٌ...', from: 2, meta: { type: 'hadith', num: '٦٦٩٨' } },
// ]
```

## Rule Optimization

Use `optimizeRules()` to automatically merge compatible rules, remove duplicate patterns, and sort rules by specificity (longest patterns first):

```typescript
import { optimizeRules } from 'flappa-doormal';

const rules = [
  // These will be merged because meta/fuzzy options match
  { lineStartsWith: ['{{kitab}}'], fuzzy: true, meta: { type: 'header' } },
  { lineStartsWith: ['{{bab}}'], fuzzy: true, meta: { type: 'header' } },
  
  // This will be kept separate
  { lineStartsAfter: ['{{numbered}}'], meta: { type: 'entry' } },
];

const { rules: optimized, mergedCount } = optimizeRules(rules);

// Result:
// optimized[0] = { 
//   lineStartsWith: ['{{kitab}}', '{{bab}}'], 
//   fuzzy: true, 
//   meta: { type: 'header' } 
// }
// optimized[1] = { lineStartsAfter: ['{{numbered}}'], ... }
```

## Rule Validation

Use `validateRules()` to detect common mistakes in rule patterns before running segmentation:

```typescript
import { validateRules } from 'flappa-doormal';

const issues = validateRules([
  { lineStartsAfter: ['raqms:num'] },       // Missing {{}}
  { lineStartsWith: ['{{unknown}}'] },      // Unknown token
  { lineStartsAfter: ['## (rumuz:rumuz)'] } // Typo - should be {{rumuz:rumuz}}
]);

// issues[0]?.lineStartsAfter?.[0]?.type === 'missing_braces'
// issues[1]?.lineStartsWith?.[0]?.type === 'unknown_token'
// issues[2]?.lineStartsAfter?.[0]?.type === 'missing_braces'

// To get a simple list of error strings for UI display:
import { formatValidationReport } from 'flappa-doormal';

const errors = formatValidationReport(issues);
// [
//   'Rule 1, lineStartsAfter: Missing {{}} around token "raqms:num"',
//   'Rule 2, lineStartsWith: Unknown token "{{unknown}}"',
//   ...
// ]
```

**Checks performed:**
- **Missing braces**: Detects token names like `raqms:num` without `{{}}`
- **Unknown tokens**: Flags tokens inside `{{}}` that don't exist (e.g., `{{nonexistent}}`)
- **Duplicates**: Finds duplicate patterns within the same rule

## Token Mapping Utilities

When building UIs for rule editing, it's often useful to separate the *token pattern* (e.g., `{{raqms}}`) from the *capture name* (e.g., `{{raqms:hadithNum}}`).

```typescript
import { applyTokenMappings, stripTokenMappings } from 'flappa-doormal';

// 1. Apply user-defined mappings to a raw template
const template = '{{raqms}} {{dash}}';
const mappings = [{ token: 'raqms', name: 'num' }];

const result = applyTokenMappings(template, mappings);
// result = '{{raqms:num}} {{dash}}'

// 2. Strip captures to get back to the canonical pattern
const raw = stripTokenMappings(result);
// raw = '{{raqms}} {{dash}}'
```

## Prompting LLMs / Agents to Generate Rules (Shamela books)

### Pre-analysis (no LLM required): generate “hints” from the book

Before prompting an LLM, you can quickly extract **high-signal pattern hints** from the book using:
- `analyzeCommonLineStarts(pages, options)` (from `src/line-start-analysis.ts`): common **line-start signatures** (tokenized)
- `analyzeTextForRule(text)` / `detectTokenPatterns(text)` (from `src/pattern-detection.ts`): turn a **single representative line** into a token template suggestion

These help the LLM avoid guessing and focus on the patterns actually present.

#### Step 1: top line-start signatures (frequency-first)

```typescript
import { analyzeCommonLineStarts } from 'flappa-doormal';

const top = analyzeCommonLineStarts(pages, {
  sortBy: 'count',
  topK: 40,
  minCount: 10,
});

console.log(top.map((p) => ({ pattern: p.pattern, count: p.count, example: p.examples[0] })));
```

Typical output (example):

```text
[
  { pattern: "{{numbered}}", count: 1200, example: { pageId: 50, line: "١ - حَدَّثَنَا ..." } },
  { pattern: "{{bab}}",      count:  180, example: { pageId: 66, line: "باب ..." } },
  { pattern: "##\\s*{{bab}}",count:  140, example: { pageId: 69, line: "## باب ..." } }
]
```

If you only want to analyze headings (to see what comes *after* `##`):

```typescript
const headingVariants = analyzeCommonLineStarts(pages, {
  lineFilter: (line) => line.startsWith('##'),
  sortBy: 'count',
  topK: 40,
});
```

#### Step 2: convert a few representative lines into token templates

Pick 3–10 representative line prefixes from the book (often from the examples returned above) and run:

```typescript
import { analyzeTextForRule } from 'flappa-doormal';

console.log(analyzeTextForRule("٢٩- خ سي: أحمد بن حميد ..."));
// -> { template: "{{raqms}}- {{rumuz}}: أحمد...", patternType: "lineStartsAfter", fuzzy: false, ... }
```

#### Step 3: paste the “hints” into your LLM prompt

When you prompt the LLM, include a short “Hints” section:
- Top 20–50 `analyzeCommonLineStarts` patterns (with counts + 1–2 examples)
- 3–10 `analyzeTextForRule(...)` results
- A small sample of pages (not the full book)

Then instruct the LLM to **prioritize rules that align with those hints**.

You can use an LLM to generate `SegmentationOptions` by pasting it a random subset of pages and asking it to infer robust segmentation rules. Here’s a ready-to-copy plain-text prompt:

```text
You are helping me generate JSON configuration for a text-segmentation function called segmentPages(pages, options).
It segments Arabic book pages (e.g., Shamela) into logical segments (books/chapters/sections/entries/hadiths).

I will give you a random subset of pages so you can infer patterns. You must respond with ONLY JSON (no prose).

I will paste a random subset of pages. Each page has:
- id: page number (not necessarily consecutive)
- content: plain text; line breaks are \n

Output ONLY a JSON object compatible with SegmentationOptions (no prose, no code fences).

SegmentationOptions shape:
- rules: SplitRule[]
- optional: maxPages, breakpoints, prefer

SplitRule constraints:
- Each rule must use exactly ONE of: lineStartsWith, lineStartsAfter, lineEndsWith, template, regex
- Optional fields: split ("at" | "after"), meta, min, max, exclude, occurrence ("first" | "last"), fuzzy

Important behaviors:
- lineStartsAfter matches at line start but strips the marker from segment.content.
- Template patterns (lineStartsWith/After/EndsWith/template) auto-escape ()[] outside tokens.
- Raw regex patterns do NOT auto-escape and can include groups, named captures, etc.

Available tokens you may use in templates:
- {{basmalah}}  (بسم الله / ﷽)
- {{kitab}}     (كتاب)
- {{bab}}       (باب)
- {{fasl}}      (فصل | مسألة)
- {{naql}}      (حدثنا/أخبرنا/... narration phrases)
- {{raqm}}      (single Arabic-Indic digit)
- {{raqms}}     (Arabic-Indic digits)
- {{dash}}      (dash variants)
- {{tarqim}}    (punctuation [. ! ? ؟ ؛])
- {{harf}}      (Arabic letter)
- {{harfs}}     (single-letter codes separated by spaces; e.g. "د ت س ي ق")
- {{rumuz}}     (rijāl/takhrīj source abbreviations; matches blocks like "خت ٤", "خ سي", "خ فق")

Named captures:
- {{raqms:num}} captures to meta.num
- {{:name}} captures arbitrary text to meta.name

Your tasks:
1) Identify document structure from the sample:
   - book headers (كتاب), chapter headers (باب), sections (فصل/مسألة), hadith numbering, biography entries, etc.
2) Propose a minimal but robust ordered ruleset:
   - Put most-specific rules first.
   - Use fuzzy:true for Arabic headings where diacritics vary.
   - Use lineStartsAfter when you want to remove the marker (e.g., hadith numbers, rumuz prefixes).
3) Use constraints:
   - Use min/max/exclude when front matter differs or specific pages are noisy.
4) If segments can span many pages:
   - Set maxPages and breakpoints.
   - Suggested breakpoints (in order): "{{tarqim}}\\s*", "\\n", "" (page boundary)
   - Prefer "longer" unless there’s a reason to prefer shorter segments.
5) Capture useful metadata:
   - For numbering patterns, capture the number into meta.num (e.g., {{raqms:num}}).

Examples (what good answers look like):

Example A: hadith-style numbered segments
Input pages:
PAGE 10:
٣٤ - حَدَّثَنَا ...\n... (rest of hadith)
PAGE 11:
٣٥ - حَدَّثَنَا ...\n... (rest of hadith)

Good JSON answer:
{
  "rules": [
    {
      "lineStartsAfter": ["{{raqms:num}} {{dash}}\\s*"],
      "split": "at",
      "meta": { "type": "hadith" }
    }
  ]
}

Example B: chapter markers + hadith numbers
Input pages:
PAGE 50:
كتاب الصلاة\nباب فضل الصلاة\n١ - حَدَّثَنَا ...\n...
PAGE 51:
٢ - حَدَّثَنَا ...\n...

Good JSON answer:
{
  "rules": [
    { "fuzzy": true, "lineStartsWith": ["{{kitab}}"], "split": "at", "meta": { "type": "book" } },
    { "fuzzy": true, "lineStartsWith": ["{{bab}}"], "split": "at", "meta": { "type": "chapter" } },
    { "lineStartsAfter": ["{{raqms:num}}\\s*{{dash}}\\s*"], "split": "at", "meta": { "type": "hadith" } }
  ]
}

Example C: narrator/rijāl entries with rumuz (codes) + colon
Input pages:
PAGE 257:
٢٩- خ سي: أحمد بن حميد...\nوكان من حفاظ الكوفة.
PAGE 258:
١٠٢- ق: تمييز ولهم شيخ آخر...\n...

Good JSON answer:
{
  "rules": [
    {
      "lineStartsAfter": ["{{raqms:num}}\\s*{{dash}}\\s*{{rumuz}}:\\s*"],
      "split": "at",
      "meta": { "type": "entry" }
    }
  ]
}

Now wait for the pages.
```

### Sentence-Based Splitting (Last Period Per Page)

```typescript
const segments = segmentPages(pages, {
  rules: [{
    lineEndsWith: ['\\.'],
    split: 'after',
    occurrence: 'last',
  }]
});
```

### Multiple Rules with Priority

```typescript
const segments = segmentPages(pages, {
  rules: [
    // First: Chapter headers (highest priority)
    { fuzzy: true, lineStartsAfter: ['{{kitab:book}} '], split: 'at', meta: { type: 'chapter' } },
    // Second: Sub-chapters
    { fuzzy: true, lineStartsAfter: ['{{bab:section}} '], split: 'at', meta: { type: 'section' } },
    // Third: Individual hadiths
    { lineStartsAfter: ['{{raqms:num}} {{dash}} '], split: 'at', meta: { type: 'hadith' } },
  ]
});
```

## API Reference

### `segmentPages(pages, options)`

Main segmentation function.

```typescript
import { segmentPages, type Page, type SegmentationOptions, type Segment } from 'flappa-doormal';

const pages: Page[] = [
  { id: 1, content: 'First page content...' },
  { id: 2, content: 'Second page content...' },
];

const options: SegmentationOptions = {
  // Optional preprocessing step: regex replacements applied per-page BEFORE segmentation.
  // Useful for normalizing OCR/typos/spacing so rules match consistently.
  //
  // Notes:
  // - `flags` defaults to 'gu'. If provided, `g` and `u` are always enforced.
  // - `pageIds: []` means "apply to no pages" (skip that rule).
  // - Remember JSON escaping: to match a literal '.', use regex: "\\\\." in JSON.
  replace: [
    { regex: "([\\u0660-\\u0669]+)\\s*[-–—ـ]\\s*", replacement: "$1 - " }
  ],
  rules: [
    { lineStartsWith: ['## '], split: 'at' }
  ],
  // How to join content across page boundaries in OUTPUT segments:
  // - 'space' (default): page boundaries become spaces
  // - 'newline': preserve page boundaries as newlines
  pageJoiner: 'newline',

  // Breakpoint preferences for resizing oversized segments:
  // - 'longer' (default): maximizes segment size within limits
  // - 'shorter': minimizes segment size (splits at first match)
  prefer: 'longer',

  // Post-structural limit: split if segment spans more than 2 pages
  maxPages: 2,

  // Post-structural limit: split if segment exceeds 5000 characters
  maxContentLength: 5000,

  // Enable match metadata in segments (meta.debug)
  debug: true,

  // Custom logger for tracing
  logger: {
    info: (m) => console.log(m),
    warn: (m) => console.warn(m),
  }
};

const segments: Segment[] = segmentPages(pages, options);
```

### Marker recovery (when `lineStartsAfter` was used by accident)

If you accidentally used `lineStartsAfter` for markers that should have been preserved (e.g. Arabic connective phrases like `وروى` / `وذكر`), you can recover those missing prefixes from existing segments.

#### `recoverMistakenLineStartsAfterMarkers(pages, segments, options, selector, opts?)`

This function returns new segments with recovered `content` plus a `report` describing what happened.

**Recommended (deterministic) mode**: rerun segmentation with selected rules converted to `lineStartsWith`, then merge recovered content back.

```ts
import { recoverMistakenLineStartsAfterMarkers, segmentPages } from 'flappa-doormal';

const pages = [{ id: 1, content: 'وروى أحمد\nوذكر خالد' }];
const options = { rules: [{ lineStartsAfter: ['وروى '] }, { lineStartsAfter: ['وذكر '] }] };

const segments = segmentPages(pages, options);
// segments[0].content === 'أحمد' (marker stripped)

const { segments: recovered, report } = recoverMistakenLineStartsAfterMarkers(
  pages,
  segments,
  options,
  { type: 'rule_indices', indices: [0] }, // recover only the first rule
);

// recovered[0].content === 'وروى أحمد'
// recovered[1].content === 'خالد'  (unchanged)
console.log(report.summary);
```

**Optional**: best-effort anchoring mode attempts to recover without rerunning first, then falls back to rerun for unresolved segments:

```ts
const { segments: recovered } = recoverMistakenLineStartsAfterMarkers(
  pages,
  segments,
  options,
  { type: 'rule_indices', indices: [0] },
  { mode: 'best_effort_then_rerun' }
);
```

Notes:
- Recovery is **explicitly scoped** by the `selector`; it will not “guess” which rules are mistaken.
- If your segments were heavily post-processed (trimmed/normalized/reordered), recovery may return unresolved items; see the report for details.

### `stripHtmlTags(html)`

Remove all HTML tags from content, keeping only text.

```typescript
import { stripHtmlTags } from 'flappa-doormal';

const text = stripHtmlTags('<p>Hello <b>World</b></p>');
// Returns: 'Hello World'
```

For more sophisticated HTML to Markdown conversion (like converting `<span data-type="title">` to `## ` headers), you can implement your own function. Here's an example:

```typescript
const htmlToMarkdown = (html: string): string => {
    return html
        // Convert title spans to markdown headers
        .replace(/<span[^>]*data-type=["']title["'][^>]*>(.*?)<\/span>/gi, '## $1')
        // Strip narrator links but keep text
        .replace(/<a[^>]*href=["']inr:\/\/[^"']*["'][^>]*>(.*?)<\/a>/gi, '$1')
        // Strip all remaining HTML tags
        .replace(/<[^>]*>/g, '');
};
```

### `expandTokens(template)`

Expand template tokens to regex pattern.

```typescript
import { expandTokens } from 'flappa-doormal';

const pattern = expandTokens('{{raqms}} {{dash}}');
// Returns: '[\u0660-\u0669]+ [-–—ـ]'
```

### `makeDiacriticInsensitive(text)`

Make Arabic text diacritic-insensitive for fuzzy matching.

```typescript
import { makeDiacriticInsensitive } from 'flappa-doormal';

const pattern = makeDiacriticInsensitive('حدثنا');
// Returns regex pattern matching 'حَدَّثَنَا', 'حدثنا', etc.
```

### `TOKEN_PATTERNS`

Access available token definitions.

```typescript
import { TOKEN_PATTERNS } from 'flappa-doormal';

console.log(TOKEN_PATTERNS.narrated);
// 'حدثنا|أخبرنا|حدثني|وحدثنا|أنبأنا|سمعت'
```

### Pattern Detection Utilities

These functions help auto-detect tokens in text, useful for building UI tools that suggest rule configurations from user-highlighted text.

#### `detectTokenPatterns(text)`

Analyzes text and returns all detected token patterns with their positions.

```typescript
import { detectTokenPatterns } from 'flappa-doormal';

const detected = detectTokenPatterns("٣٤ - حدثنا");
// Returns:
// [
//   { token: 'raqms', match: '٣٤', index: 0, endIndex: 2 },
//   { token: 'dash', match: '-', index: 3, endIndex: 4 },
//   { token: 'naql', match: 'حدثنا', index: 5, endIndex: 10 }
// ]
```

#### `generateTemplateFromText(text, detected)`

Converts text to a template string using detected patterns.

```typescript
import { detectTokenPatterns, generateTemplateFromText } from 'flappa-doormal';

const text = "٣٤ - ";
const detected = detectTokenPatterns(text);
const template = generateTemplateFromText(text, detected);
// Returns: "{{raqms}} {{dash}} "
```

#### `suggestPatternConfig(detected)`

Suggests the best pattern type and options based on detected patterns.

```typescript
import { detectTokenPatterns, suggestPatternConfig } from 'flappa-doormal';

// For numbered patterns (hadith-style)
const hadithDetected = detectTokenPatterns("٣٤ - ");
suggestPatternConfig(hadithDetected);
// Returns: { patternType: 'lineStartsAfter', fuzzy: false, metaType: 'hadith' }

// For structural patterns (chapter markers)
const chapterDetected = detectTokenPatterns("باب الصلاة");
suggestPatternConfig(chapterDetected);
// Returns: { patternType: 'lineStartsWith', fuzzy: true, metaType: 'bab' }
```

#### `analyzeTextForRule(text)`

Complete analysis that combines detection, template generation, and config suggestion.

```typescript
import { analyzeTextForRule } from 'flappa-doormal';

const result = analyzeTextForRule("٣٤ - حدثنا");
// Returns:
// {
//   template: "{{raqms}} {{dash}} {{naql}}",
//   patternType: 'lineStartsAfter',
//   fuzzy: false,
//   metaType: 'hadith',
//   detected: [...]
// }

// Use the result to build a rule:
const rule = {
  [result.patternType]: [result.template],
  split: 'at',
  fuzzy: result.fuzzy,
  meta: { type: result.metaType }
};
```

### Expanding composite tokens (for adding named captures)

Some tokens are **composites** (e.g. `{{numbered}}`), which are great for quick signatures but less convenient when you want to add named captures (e.g. capture the number).

You can expand composites back into their underlying template form:

```typescript
import { expandCompositeTokensInTemplate } from 'flappa-doormal';

const base = expandCompositeTokensInTemplate('{{numbered}}');
// base === '{{raqms}} {{dash}} '

// Now you can add a named capture:
const withCapture = base.replace('{{raqms}}', '{{raqms:num}}');
// withCapture === '{{raqms:num}} {{dash}} '
```

## Types

### `SplitRule`

```typescript
type SplitRule = {
  // Pattern (choose one)
  lineStartsWith?: string[];
  lineStartsAfter?: string[];
  lineEndsWith?: string[];
  template?: string;
  regex?: string;

  // Split behavior
  split?: 'at' | 'after';  // Default: 'at'
  occurrence?: 'first' | 'last' | 'all';
  fuzzy?: boolean;

  // Constraints
  min?: number;
  max?: number;
  exclude?: (number | [number, number])[]; // Single page or [start, end] range
  skipWhen?: string; // Regex pattern (tokens supported)
  meta?: Record<string, unknown>;
};
```

### `Segment`

```typescript
type Segment = {
  content: string;
  from: number;
  to?: number;
  meta?: Record<string, unknown>;
};
```

### `DetectedPattern`

Result from pattern detection utilities.

```typescript
type DetectedPattern = {
  token: string;    // Token name (e.g., 'raqms', 'dash')
  match: string;    // The matched text
  index: number;    // Start index in original text
  endIndex: number; // End index (exclusive)
};
```

## Usage with Next.js / Node.js

```typescript
// app/api/segment/route.ts (Next.js App Router)
import { segmentPages } from 'flappa-doormal';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { pages, rules } = await request.json();
  
  const segments = segmentPages(pages, { rules });
  
  return NextResponse.json({ segments });
}
```

```typescript
// Node.js script
import { segmentPages, stripHtmlTags } from 'flappa-doormal';

const pages = rawPages.map((p, i) => ({
  id: i + 1,
  content: stripHtmlTags(p.html)
}));

const segments = segmentPages(pages, {
  rules: [{
    lineStartsAfter: ['{{raqms:num}} {{dash}} '],
    split: 'at'
  }]
});

console.log(`Found ${segments.length} segments`);
```

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Build
bun run build

# Run performance test (generates 50K pages, measures segmentation speed/memory)
bun run perf

# Lint
bunx biome lint .

# Format
bunx biome format --write .
```

## Design Decisions

### Double-Brace Syntax `{{token}}`

Single braces conflict with regex quantifiers `{n,m}`. Double braces are visually distinct and match common template syntax (Handlebars, Mustache).

### `lineStartsAfter` vs `lineStartsWith`

- `lineStartsWith`: Keep marker in content (for detection only)
- `lineStartsAfter`: Strip marker, capture only content (for clean extraction)

### Fuzzy Applied at Token Level

Fuzzy transforms are applied to raw Arabic text *before* wrapping in regex groups. This prevents corruption of regex metacharacters like `(`, `)`, `|`.

### Extracted Utilities

Complex logic is intentionally split into small, independently testable modules:

- `src/segmentation/match-utils.ts`: match filtering + capture extraction
- `src/segmentation/rule-regex.ts`: SplitRule → compiled regex builder (`buildRuleRegex`, `processPattern`)
- `src/segmentation/breakpoint-utils.ts`: breakpoint windowing/exclusion helpers, page boundary join normalization, and progressive prefix page detection for accurate `from`/`to` attribution
- `src/segmentation/breakpoint-processor.ts`: breakpoint post-processing engine (applies breakpoints after structural segmentation)

## Performance Notes

### Memory Requirements

The library concatenates all pages into a single string for pattern matching across page boundaries. Memory usage scales linearly with total content size:

| Pages | Avg Page Size | Approximate Memory |
|-------|---------------|-------------------|
| 1,000 | 5 KB | ~5 MB |
| 6,000 | 5 KB | ~30 MB |
| 40,000 | 5 KB | ~200 MB |

For typical book processing (up to 6,000 pages), memory usage is well within Node.js defaults. For very large books (40,000+ pages), ensure adequate heap size.

## For AI Agents

See [AGENTS.md](./AGENTS.md) for:
- Architecture details and design patterns
- Adding new tokens and pattern types
- Algorithm explanations
- Lessons learned during development

## Demo

An interactive demo is available at [flappa-doormal.surge.sh](https://flappa-doormal.surge.sh).

The demo source code is located in the `demo/` directory and includes:
- **Analysis**: Discover common line-start patterns in your text
- **Pattern Detection**: Auto-detect tokens in text and get template suggestions
- **Segmentation**: Apply rules and see segmented output with metadata

To run the demo locally:

```bash
cd demo
bun install
bun run dev
```

To deploy updates:

```bash
cd demo
bun run deploy
```

## License

MIT

## Inspiration

The name of the project is from Asmāʾ, it seems to be some sort of gymanstic move.