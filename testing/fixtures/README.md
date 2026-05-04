# Dictionary Fixtures

These fixtures are extracted, committed subsets of the four reference Shamela
dictionary corpora used by the dictionary integration tests.

## What lives here

- `dictionary-books/*.json`
  - reduced page fixtures containing only `{ id, content }`
  - content is the markdown-like surface used by the runtime/tests
- `dictionary-book-options.ts`
  - repo-local golden options for the four reference books
  - not part of the public library API
- `dictionary-books.ts`
  - fixture loader and validation helpers
- `dictionary-fixture-manifest.ts`
  - canonical fixture page selections

## Purpose

These fixtures let the integration tests cover real corpus behavior without
depending on a local `books/` directory or the full upstream Shamela exports.

Use them for:
- dictionary runtime regressions
- heading classifier regressions
- book-profile acceptance coverage
- compact golden summaries of per-profile segmentation output

Do not use them as the source of truth for production corpus data. They are
only representative samples.

## Page IDs

Fixture `id` values preserve the original page IDs from the source books.
Tests rely on those IDs for `maxPages`, activation gates, and page-aware
dictionary behavior.

## Full corpus workflow

To refresh these fixtures from local corpora, run:

```bash
bun run dictionary:extract-fixtures -- --books-dir /path/to/books
```

The main test suite should continue to pass even when the local `books/`
directory is absent.

## Regression and Perf Coverage

`testing/dictionary-fixtures.test.ts` checks fixture shape directly, compares
representative per-book segmentation summaries against
`dictionary-golden-summaries.ts`, and rejects accidental focused test
declarations such as `it.only(...)`.

Corpus-scale runtime expectations remain opt-in through `bun run test:perf`.
The dictionary runtime perf harness includes `intro`, `stopLemma`,
`previousWord`, and `pageContinuation` blocker paths so hot-path regressions can
be measured without making full-corpus timing mandatory in normal CI.
