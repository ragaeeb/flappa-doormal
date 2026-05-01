#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

type ManifestEntry = {
    book: string;
    chunk: number;
    file: string;
    firstOriginalRow: number;
    lastOriginalRow: number;
    rowCount: number;
};

const ROOT = resolve(import.meta.dir, '..');
const DEFAULT_INPUT_DIR = join(ROOT, 'docs', 'dictionary-html');
const DEFAULT_OUTPUT_DIR = join(DEFAULT_INPUT_DIR, 'chunks');
const DEFAULT_CHUNK_COUNT = 4;
const DEFAULT_BOOK_FILES = ['1687.csv', '2553.csv', '7030.csv', '7031.csv'];

const usage = () => {
    console.error(`Usage:
  bun scripts/split-dictionary-csvs.ts
  bun scripts/split-dictionary-csvs.ts --input-dir docs/dictionary-html --output-dir docs/dictionary-html/chunks
  bun scripts/split-dictionary-csvs.ts --chunks 6 --book 1687.csv --book 2553.csv
`);
};

const parseArgs = (argv: string[]) => {
    const books: string[] = [];
    let inputDir = DEFAULT_INPUT_DIR;
    let outputDir = DEFAULT_OUTPUT_DIR;
    let chunkCount = DEFAULT_CHUNK_COUNT;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        switch (arg) {
            case '--input-dir':
                inputDir = resolve(argv[index + 1] ?? '');
                index += 1;
                break;
            case '--output-dir':
                outputDir = resolve(argv[index + 1] ?? '');
                index += 1;
                break;
            case '--chunks':
                chunkCount = Number(argv[index + 1] ?? DEFAULT_CHUNK_COUNT);
                index += 1;
                break;
            case '--book':
                books.push(argv[index + 1] ?? '');
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

    if (!Number.isInteger(chunkCount) || chunkCount < 1) {
        throw new Error('--chunks must be an integer >= 1');
    }

    return {
        bookFiles: books.length > 0 ? books : DEFAULT_BOOK_FILES,
        chunkCount,
        inputDir,
        outputDir,
    };
};

const parseCsvLine = (line: string) => {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        if (inQuotes) {
            if (char === '"' && line[index + 1] === '"') {
                current += '"';
                index += 1;
            } else if (char === '"') {
                inQuotes = false;
            } else {
                current += char;
            }
        } else if (char === ',') {
            fields.push(current);
            current = '';
        } else if (char === '"') {
            inQuotes = true;
        } else {
            current += char;
        }
    }

    fields.push(current);
    return fields;
};

const chunkSizeFor = (totalRows: number, chunkCount: number) => Math.ceil(totalRows / chunkCount);

const splitRows = (rows: string[], chunkCount: number) => {
    const size = chunkSizeFor(rows.length, chunkCount);
    const chunks: string[][] = [];

    for (let start = 0; start < rows.length; start += size) {
        chunks.push(rows.slice(start, start + size));
    }

    return chunks;
};

const createChunkFilename = (bookBaseName: string, chunkIndex: number, firstRow: number, lastRow: number) =>
    `${bookBaseName}.part-${String(chunkIndex).padStart(2, '0')}.rows-${firstRow}-to-${lastRow}.csv`;

const args = parseArgs(process.argv.slice(2));
await mkdir(args.outputDir, { recursive: true });

const manifest: ManifestEntry[] = [];

for (const file of args.bookFiles) {
    const sourcePath = join(args.inputDir, file);
    const source = await readFile(sourcePath, 'utf8');
    const lines = source.trimEnd().split('\n');
    const header = lines[0] ?? '';
    const rows = lines.slice(1);
    const bookBaseName = basename(file, '.csv');
    const chunks = splitRows(rows, args.chunkCount);

    for (const [index, chunkRows] of chunks.entries()) {
        if (chunkRows.length === 0) {
            continue;
        }

        const firstFields = parseCsvLine(chunkRows[0]);
        const lastFields = parseCsvLine(chunkRows.at(-1) ?? '');
        const firstOriginalRow = Number(firstFields[0]);
        const lastOriginalRow = Number(lastFields[0]);
        const chunkNumber = index + 1;
        const filename = createChunkFilename(bookBaseName, chunkNumber, firstOriginalRow, lastOriginalRow);
        const outPath = join(args.outputDir, filename);
        const content = `${header}\n${chunkRows.join('\n')}\n`;

        await writeFile(outPath, content, 'utf8');

        manifest.push({
            book: bookBaseName,
            chunk: chunkNumber,
            file: filename,
            firstOriginalRow,
            lastOriginalRow,
            rowCount: chunkRows.length,
        });
    }
}

const manifestPath = join(args.outputDir, 'manifest.json');
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

for (const entry of manifest) {
    console.log(
        `${entry.book} chunk ${entry.chunk}: rows ${entry.firstOriginalRow}-${entry.lastOriginalRow} (${entry.rowCount}) -> ${entry.file}`,
    );
}

console.log(`manifest -> ${manifestPath}`);
