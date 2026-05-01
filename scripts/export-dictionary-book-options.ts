#!/usr/bin/env bun
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DICTIONARY_BOOK_OPTIONS } from '../testing/fixtures/dictionary-book-options.ts';

const ROOT = resolve(import.meta.dir, '..');
const DEFAULT_OUT_DIR = join(ROOT, 'out', 'dictionary-options');

const usage = () => {
    console.error(`Usage:
  bun scripts/export-dictionary-book-options.ts
  bun scripts/export-dictionary-book-options.ts --out-dir /path/to/output
`);
};

const parseArgs = (argv: string[]) => {
    let outDir = DEFAULT_OUT_DIR;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        switch (arg) {
            case '--out-dir':
                outDir = resolve(argv[index + 1] ?? '');
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

    return { outDir };
};

const args = parseArgs(process.argv.slice(2));
await mkdir(args.outDir, { recursive: true });

for (const [bookId, options] of Object.entries(DICTIONARY_BOOK_OPTIONS)) {
    const outFile = join(args.outDir, `${bookId}.json`);
    await Bun.write(outFile, `${JSON.stringify(options, null, 2)}\n`);
    console.log(`wrote ${outFile}`);
}
