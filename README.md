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

**Arabic text marker pattern library** - Generate regex patterns from declarative marker configurations.

🎯 **Purpose:** Simplify Arabic text segmentation by replacing complex regex patterns with readable, composable templates.

## Installation

```bash
bun add flappa-doormal
# Peer dependencies
bun add bitaboom baburchi shamela
```

## Quick Start

```typescript
import { generateRegexFromMarker } from 'flappa-doormal';

// Simple numbered marker
const regex = generateRegexFromMarker({
  type: 'numbered'  // Defaults: Arabic-Indic numerals, dash separator
});

regex.exec('٥ - نص الحديث');
// Returns: ['٥ - نص الحديث', 'نص الحديث']
```

## Features

✅ **13 Preset Types** - Common patterns like `bab`, `hadith-chain`, `basmala`  
✅ **Template System** - Use `{num}`, `{dash}`, `{bullet}` instead of regex  
✅ **Type-Safe** - Full TypeScript support  
✅ **Composable** - Mix and match tokens with quantifiers  
✅ **Diacritic-Insensitive** - Handles Arabic text variations

## Marker Types

### Basic Types
```typescript
{ type: 'numbered' }      // ٥ - text
{ type: 'bullet' }        // • text
{ type: 'bab' }           // باب chapter
{ type: 'hadith-chain' }  // حَدَّثَنَا narrator
{ type: 'basmala' }       // بسم الله
{ type: 'square-bracket' } // [٦٥] reference
```

### Numbered Variants
```typescript
{ type: 'num-letter' }    // ٥ أ - (number + letter)
{ type: 'num-paren' }     // ٥ (أ) - (number + paren)
{ type: 'num-slash' }     // ٥/٦ - (number/number)
```

### Custom Patterns

**Using templates (recommended):**
```typescript
{
  type: 'pattern',
  template: '{bullet}? {num}+ {dash}'
}
```

**Using raw regex (for complex patterns):**
```typescript
{
  type: 'pattern',
  pattern: '^CUSTOM: (.*)'  // When templates aren't sufficient
}
```

**Using format for numbered:**
```typescript
{
  type: 'numbered',
  format: '{bullet}+ {num} {letter} {dash}'
}
```

## Complex Pattern Examples

### Comma-Separated Numerals
Match patterns like: `٩٩٣٦، ٩٩٣٧ - حَدَّثَنَا`

```typescript
{
  type: 'pattern',
  template: '{num}(?:،{s}{num})*{s}{dash}'
}
```

### Number / Letter
Match patterns like: `١١٠٧٣/ أ - حَدَّثَنَا`

```typescript
{
  type: 'pattern',
  template: '{num}{s}/{s}{letter}{s}{dash}'
}
```

### Number / Number (Built-in)
Match patterns like: `١٠٢٦٦ / ١ - "وَإِذَا`

```typescript
{
  type: 'num-slash'  // Built-in preset
}
```

### Repeating Dots
Match patterns like: `. . . . . . . . . .`

```typescript
{
  type: 'pattern',
  template: '\\.(?:{s}\\.)+' 
 }
```

### Asterisk + Dots + Number
Match patterns like: `*. . . / ٨٦ - حَدَّثَنَا`

**Option 1: Capture from asterisk**
```typescript
{
  type: 'pattern',
  template: '\\*\\.(?:{s}\\.)*{s}/{s}{num}{s}{dash}',
  removeMarker: false  // Keep everything
}
```

**Option 2: Detect from asterisk, capture from number**
```typescript
{
  type: 'pattern',
  pattern: '^\\*\\.(?:\\s?\\.)*\\s?/\\s?([\\u0660-\\u0669]+\\s?[-–—ـ].*)'
}
```

## Template Tokens

| Token | Matches | Example |
|-------|---------|---------|
| `{num}` | Arabic-Indic numerals | `[\\u0660-\\u0669]+` |
| `{latin}` | Latin numerals | `\\d+` |
| `{roman}` | Roman numerals | `[IVXLCDM]+` |
| `{dash}` | Various dashes | `[-–—ـ]` |
| `{dot}` | Period | `\\.` |
| `{bullet}` | Bullet variants | `[•*°]` |
| `{letter}` | Arabic letters | `[أ-ي]` |
| `{s}` | Optional space | `\\s?` |
| `{space}` | Required space | `\\s+` |

**Quantifiers:** Add `+`, `*`, `?` after tokens: `{num}+`, `{bullet}?`

## Examples

### Before (Regex)
```typescript
const pattern = '^[•*°]+ ([\\u0660-\\u0669]+\\s?[-–—ـ].*)';
```

### After (Template)
```typescript
{
  type: 'numbered',
  format: '{bullet}+ {num} {dash}'
}
```

**80% reduction in complexity!**

## API

### `generateRegexFromMarker(config)`

```typescript
import { generateRegexFromMarker, type MarkerConfig } from 'flappa-doormal';

const config: MarkerConfig = {
  type: 'numbered',
  numbering: 'arabic-indic',  // or 'latin', 'roman'
  separator: 'dash',           // or 'dot', 'colon', 'paren'
  removeMarker: true,          // Remove marker from capture (default: true)
};

const regex = generateRegexFromMarker(config);
```

### `expandTemplate(template, options)`

```typescript
import { expandTemplate } from 'flappa-doormal';

const pattern = expandTemplate('{num} {dash}');
// Returns: '^[\\u0660-\\u0669]+ [-–—ـ](.*)'

const pattern2 = expandTemplate('{num} {dash}', { removeMarker: false });
// Returns: '^([\\u0660-\\u0669]+ [-–—ـ].*)'
```

### `validateTemplate(template)`

```typescript
import { validateTemplate } from 'flappa-doormal';

const result = validateTemplate('{num} {invalid}');
// Returns: { valid: false, errors: ['Unknown tokens: {invalid}'] }
```

## Configuration Options

```typescript
type MarkerConfig = {
  type: MarkerType;
  numbering?: 'arabic-indic' | 'latin' | 'roman'; 
  separator?: 'dash' | 'dot' | 'paren' | 'colon' | 'none' | string;
  format?: string;           // Template for numbered markers
  template?: string;         // Template for pattern markers
  pattern?: string;          // Raw regex (when templates aren't enough)
  tokens?: Record<string, string>;  // Custom token definitions
  phrases?: string[];        // For 'phrase' and 'hadith-chain' types
  removeMarker?: boolean;    // Default: true for numbered/bullet
};
```

## Extensibility

### Extending Default Phrase Lists

```typescript
import { DEFAULT_HADITH_PHRASES, generateRegexFromMarker } from 'flappa-doormal';

// Add to existing hadith phrases
const myPhrases = [...DEFAULT_HADITH_PHRASES, 'أَخْبَرَنِي', 'سَمِعْتُ'];

const regex = generateRegexFromMarker({
  type: 'hadith-chain',
  phrases: myPhrases,
});
```

### Using Type-Specific Generators

```typescript
import { generateHadithChainRegex, DEFAULT_HADITH_PHRASES } from 'flappa-doormal';

// Direct access to type-specific generator
const regex = generateHadithChainRegex(
  { type: 'hadith-chain', phrases: [...DEFAULT_HADITH_PHRASES, 'extra'] },
  true // removeMarker
);
```

### Custom Tokens

```typescript
import { createTokenMap, expandTemplate } from 'flappa-doormal';

const customTokens = createTokenMap({
  verse: '\\[[\\u0660-\\u0669]+\\]',
  tafsir: 'تفسير',
});

const pattern = expandTemplate('{verse} {tafsir}', { 
  tokens: customTokens,
  removeMarker: true 
});
```

## Available Exports

**Constants:**
- `DEFAULT_HADITH_PHRASES` - Default narrator phrases
- `DEFAULT_BASMALA_PATTERNS` - Default basmala patterns
- `TOKENS` - Token definitions

**Functions:**
- `generateRegexFromMarker()` - Main function
- `generate{Type}Regex()` - 12 type-specific generators
- `expandTemplate()` - Template expansion
- `validateTemplate()` - Template validation
- `createTokenMap()` - Custom token maps

## Testing

This project has comprehensive unit test coverage for all marker type generators.

```bash
# Run all tests
bun test

# Run specific test file
bun test src/markers/type-generators.test.ts

# Run tests with coverage
bun test --coverage
```

**Test Coverage**: 100% coverage for `type-generators.ts` with 54+ test cases covering:
- All 12 marker type generators
- Edge cases (empty phrases, diacritic variations, custom separators)
- Error handling (missing required fields)
- Various numbering styles and separators

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Build (if needed)
bun run build

# Format code
bunx biome format --write .

# Lint code
bunx biome lint .
```

## For AI Agents

See [AGENTS.md](./AGENTS.md) for comprehensive guidance on:
- Project architecture and design patterns
- Adding new marker types
- Testing strategies
- Code quality standards
- Extension points

## License

MIT

## Related

- [bitaboom](https://github.com/ragaeeb/bitaboom) - Arabic text utilities
- [baburchi](https://github.com/ragaeeb/baburchi) - Text sanitization
- [shamela](https://github.com/ragaeeb/shamela) - Shamela library utilities
