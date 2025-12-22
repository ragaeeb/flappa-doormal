# flappa-doormal

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

**Declarative Arabic text segmentation library** - Split pages of content into logical segments using human-readable patterns.

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
✅ **Fuzzy matching**: Ignore diacritics with `fuzzy: true`  
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

### 7. Occurrence Filtering

Control which matches to use:

```typescript
{
  lineEndsWith: ['\\.'],
  split: 'after',
  occurrence: 'last',  // Only split at LAST period on page
  maxSpan: 1,          // Apply per-page
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
    maxSpan: 1
  }]
});
```

### Page Fallback for Unmatched Content

When using `maxSpan` to group matches per page, use `fallback: 'page'` to prevent unmatched pages from merging with adjacent segments:

```typescript
const segments = segmentPages(pages, {
  rules: [{
    template: '{{tarqim}}',  // Match punctuation marks
    split: 'after',
    occurrence: 'last',
    maxSpan: 1,
    fallback: 'page'  // If no punctuation found, segment the page anyway
  }]
});
```

**Without `fallback`**: Pages without matches merge into the next segment  
**With `fallback: 'page'`**: Each page becomes its own segment even without matches

> **Future extensions**: The `fallback` option may support additional values like `'skip'` (omit unmatched content) or `'line'` (split at line breaks) in future versions.

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
  rules: [
    { lineStartsWith: ['## '], split: 'at' }
  ],
  // How to join content across page boundaries in OUTPUT segments:
  // - 'space' (default): page boundaries become spaces
  // - 'newline': preserve page boundaries as newlines
  pageJoiner: 'space',
};

const segments: Segment[] = segmentPages(pages, options);
```

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
  maxSpan?: number;
  fuzzy?: boolean;
  fallback?: 'page';  // NEW: Page-boundary fallback

  // Constraints
  min?: number;
  max?: number;
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
- `src/segmentation/breakpoint-utils.ts`: breakpoint windowing/exclusion helpers + page boundary join normalization
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

### `maxSpan` Sliding Window Behavior

The `maxSpan` option uses a **sliding window algorithm** based on page ID difference:

```typescript
// maxSpan = maximum page ID difference when looking ahead for split points
// Algorithm prefers LONGER segments by looking as far ahead as allowed

// Pages [1, 2, 3, 4] with maxSpan: 1, occurrence: 'last'
// Window from page 1: pages 1-2 (diff <= 1), splits at page 2's last match
// Window from page 3: pages 3-4 (diff <= 1), splits at page 4's last match
// Result: 2 segments spanning pages 1-2 and 3-4

// Pages [1, 5, 10] with maxSpan: 1, occurrence: 'last'  
// Window from page 1: only page 1 (5-1=4 > 1), splits at page 1
// Window from page 5: only page 5 (10-5=5 > 1), splits at page 5
// Window from page 10: only page 10, splits at page 10
// Result: 3 segments (pages too far apart to merge)
```

This is intentional for books where page IDs represent actual page numbers. With `occurrence: 'last'`, the algorithm finds the last match within the lookahead window, creating longer segments where possible.

## For AI Agents

See [AGENTS.md](./AGENTS.md) for:
- Architecture details and design patterns
- Adding new tokens and pattern types
- Algorithm explanations
- Lessons learned during development

## License

MIT

