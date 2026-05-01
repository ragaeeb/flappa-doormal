#!/usr/bin/env bun
import { access, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { convertContentToMarkdown } from 'shamela';
import {
    DICTIONARY_FIXTURE_PAGE_IDS,
    type DictionaryFixtureBookId,
} from '../testing/fixtures/dictionary-fixture-manifest.ts';

type BookPage = { content: string; id: number };
type BookJson = { pages: BookPage[] };

const ROOT = resolve(import.meta.dir, '..');
const DEFAULT_BOOKS_DIR = join(ROOT, 'books');
const OUT_DIR = join(ROOT, 'testing', 'fixtures', 'dictionary-books');

const usage = () => {
    console.error(`Usage:
  bun scripts/extract-dictionary-test-fixtures.ts [--books-dir /path/to/books]

Options:
  --books-dir <dir>    Directory containing 1687.json, 2553.json, 7030.json, 7031.json

Environment:
  FLAPPA_BOOKS_DIR     Fallback books directory when --books-dir is omitted
`);
};

const parseArgs = (argv: string[]) => {
    let booksDir = process.env.FLAPPA_BOOKS_DIR ?? DEFAULT_BOOKS_DIR;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        switch (arg) {
            case '--books-dir':
                booksDir = argv[index + 1] ?? '';
                index += 1;
                break;
            case '--help':
            case '-h':
                usage();
                process.exit(0);
                break;
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (!booksDir) {
        throw new Error('A books directory is required. Pass --books-dir or set FLAPPA_BOOKS_DIR.');
    }

    return { booksDir: resolve(booksDir) };
};

const ensureDir = async (path: string) => {
    try {
        await access(path);
    } catch {
        throw new Error(`Directory does not exist: ${path}`);
    }
};

const args = parseArgs(process.argv.slice(2));
await ensureDir(args.booksDir);
await mkdir(OUT_DIR, { recursive: true });

for (const [bookId, ids] of Object.entries(DICTIONARY_FIXTURE_PAGE_IDS) as Array<
    [DictionaryFixtureBookId, number[]]
>) {
    const filename = `${bookId}.json`;
    const sourcePath = join(args.booksDir, filename);
    const source = (await Bun.file(sourcePath).json()) as BookJson;
    const idSet = new Set(ids);
    const pages = source.pages
        .filter((page) => idSet.has(page.id))
        .map((page) => ({ content: convertContentToMarkdown(page.content), id: page.id }));

    if (pages.length !== idSet.size) {
        const foundIds = new Set(pages.map((page) => page.id));
        const missingIds = ids.filter((id) => !foundIds.has(id));
        throw new Error(`Missing pages in ${filename}: ${missingIds.join(', ')}`);
    }

    const outPath = join(OUT_DIR, filename);
    await Bun.write(outPath, `${JSON.stringify({ pages }, null, 2)}\n`);
    console.log(`wrote ${outPath}`);
}
