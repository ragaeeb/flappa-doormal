# AGENTS.md

## Project Overview

**flappa-doormal** is an Arabic text marker pattern library that generates regular expressions from declarative marker configurations. It simplifies Arabic text segmentation by replacing complex regex patterns with readable, composable templates.

## Architecture

### Core Components

```
src/
├── index.ts                  # Main entry point and exports
├── types.ts                  # TypeScript type definitions
└── markers/
    ├── generator.ts          # Main regex generator (entry point)
    ├── type-generators.ts    # Individual marker type generators
    ├── template-parser.ts    # Template token expansion
    ├── tokens.ts             # Token definitions
    ├── defaults.ts           # Default configuration values
    └── presets.ts            # Pre-configured phrase lists
```

### Key Design Patterns

1. **Type-Specific Generators** (`type-generators.ts`)
   - 12 isolated generator functions, one per marker type
   - Each returns a RegExp with named capture groups: `full`, `marker`, `content`
   - Handles diacritic-insensitivity via `bitaboom` library

2. **Template System** (`template-parser.ts`, `tokens.ts`)
   - Converts readable templates like `{num} {dash}` into regex patterns
   - Supports quantifiers: `{token}+`, `{token}*`, `{token}?`
   - Custom tokens via `createTokenMap()`

3. **Configuration Normalization** (`generator.ts`)
   - `generateRegexFromMarker()` applies defaults before calling type-specific generators
   - Centralizes default handling to keep type generators pure

## Marker Types

### Pattern Categories

1. **Preset Types** (no configuration required)
   - `bab` - Chapter markers (باب)
   - `basmala` - بسم الله patterns
   - `hadith-chain` - Narrator phrases (حَدَّثَنَا, etc.)
   - `square-bracket` - Reference numbers [٦٥]
   - `bullet` - Bullet points (•, *, °, -)
   - `heading` - Markdown headings (#, ##, ###)

2. **Numbered Types** (configurable numbering/separator)
   - `numbered` - Basic numbered markers
   - `num-letter` - Number + Arabic letter (٥ أ -)
   - `num-paren` - Number + parenthetical (٥ (أ) -)
   - `num-slash` - Number/number (٥/٦ -)

3. **Custom Types** (require configuration)
   - `pattern` - Custom template or raw regex
   - `phrase` - User-defined phrase list

## Working with AI Agents

### Common Tasks

#### Adding a New Marker Type

1. Add the new type to `MarkerType` union in `types.ts`
2. Create generator function in `type-generators.ts`:
   ```typescript
   export function generateMyTypeRegex(config: MarkerConfig): RegExp {
     // Implementation
     const pattern = String.raw`^(?<full>(?<marker>...)(?<content>[\s\S]*))`;
     return new RegExp(pattern, 'u');
   }
   ```
3. Add case to switch statement in `generator.ts`
4. Add comprehensive tests in `type-generators.test.ts`
5. Update README.md examples

#### Modifying Templates

- Template tokens are defined in `tokens.ts`
- Template expansion logic is in `template-parser.ts`
- Always maintain backward compatibility when changing tokens

#### Testing Strategy

- **Unit Tests**: Each generator function has dedicated test suite
- **Integration Tests**: `generator.test.ts` tests end-to-end flows
- **Complex Patterns**: `complex-patterns.test.ts` for real-world edge cases
- Run tests: `bun test`

### Code Quality Standards

1. **JSDocs**: All exported functions must have:
   - Description
   - `@param` for each parameter
   - `@returns` describing return value
   - `@throws` for error cases
   - `@example` showing usage

2. **Type Safety**:
   - Use TypeScript's strict mode
   - Avoid `any` types
   - Use `Pick<>` utility for partial configs

3. **Error Handling**:
   - Throw descriptive errors for invalid configurations
   - Validate required fields (e.g., `phrases` array for `phrase` type)

4. **Naming Conventions**:
   - Functions: `generateXxxRegex()` for generators
   - Types: PascalCase
   - Constants: SCREAMING_SNAKE_CASE for exports, camelCase for locals

## Dependencies

### Runtime (Peer Dependencies)
- **bitaboom** (^2.1.0) - Arabic text utilities for diacritic-insensitive matching

### Development
- **@biomejs/biome** - Linting and formatting
- **@types/bun** - TypeScript definitions
- **tsdown** - Build tool for TypeScript

### Testing
- **Bun's built-in test runner** - Fast, lightweight testing

## Build & Release

```bash
# Build distribution
bun run build

# Run all tests
bun test

# Format code
bunx biome format --write .

# Lint code
bunx biome lint .
```

**Build Output**: `dist/` contains compiled `.mjs` and `.d.mts` files

## Extension Points

1. **Custom Tokens**: Users can define their own via `createTokenMap()`
2. **Phrase Lists**: Extend `DEFAULT_HADITH_PHRASES` and `DEFAULT_BASMALA_PATTERNS`
3. **Direct Generator Access**: Import type-specific generators for fine-grained control

## Performance Considerations

- RegExp compilation happens once per `generateRegexFromMarker()` call
- Template expansion is lightweight (string manipulation only)
- Diacritic-insensitive patterns are optimized by `bitaboom`

## Troubleshooting

### Common Issues

1. **"pattern marker must provide either a template or pattern"**
   - Add `template` or `pattern` field to config

2. **"phrase marker requires phrases array"**
   - Ensure `phrases` is defined and non-empty

3. **Named groups not matching**
   - All generators return `full`, `marker`, `content` groups
   - Check that regex is anchored with `^` at start

## Future Improvements

Potential areas for enhancement:
- Add more preset types (e.g., Quranic verse markers)
- Support for RTL-specific patterns
- Performance benchmarks
- Visual regex debugger/tester
