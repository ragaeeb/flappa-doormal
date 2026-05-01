#!/usr/bin/env bun
import { access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { convertContentToMarkdown } from 'shamela';
import { applyPreprocessToPage, diagnoseDictionaryProfile } from '../src/index.ts';
import { DICTIONARY_BOOK_OPTIONS, type DictionaryBookId } from '../testing/fixtures/dictionary-book-options.ts';
import type { ArabicDictionaryProfile } from '../src/types/dictionary.ts';

type BookPage = { content: string; id: number };
type BookJson = { pages: BookPage[] };

type Args = {
    book: string;
    booksDir: string;
    input: string;
    json: boolean;
    out: string;
    profile: string;
    sampleLimit: number;
};

const ROOT = resolve(import.meta.dir, '..');
const DEFAULT_BOOKS_DIR = process.env.FLAPPA_BOOKS_DIR
    ? resolve(process.env.FLAPPA_BOOKS_DIR)
    : join(ROOT, 'books');

const BUILTIN_PROFILES = Object.fromEntries(
    Object.entries(DICTIONARY_BOOK_OPTIONS).map(([bookId, options]) => [bookId, options.dictionary]),
) as Record<DictionaryBookId, ArabicDictionaryProfile>;

const usage = () => {
    console.error(`Usage:
  bun scripts/analyze-dictionary-profile.ts --book 1687 --input /path/to/1687.json
  bun scripts/analyze-dictionary-profile.ts --book 1687 --books-dir /path/to/books --json
  bun scripts/analyze-dictionary-profile.ts --book 1687 --input /path/to/1687.json --profile ./path/to/profile.ts#MY_PROFILE

Options:
  --book <id>          Builtin book id used to pick the default profile and preprocess pipeline
  --input <file>       Explicit path to a Shamela book JSON file
  --books-dir <dir>    Directory containing <book>.json files when --input is omitted
  --profile <ref>      Builtin id or module path with optional #exportName
  --sample-limit <n>   Number of diagnostic samples to keep (default: 40)
  --json               Print raw JSON diagnostics
  --out <file>         Write output to file instead of stdout
`);
};

const parseArgs = (argv: string[]): Args => {
    const args: Args = {
        book: '',
        booksDir: DEFAULT_BOOKS_DIR,
        input: '',
        json: false,
        out: '',
        profile: '',
        sampleLimit: 40,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        switch (arg) {
            case '--book':
                args.book = argv[index + 1] ?? '';
                index += 1;
                break;
            case '--books-dir':
                args.booksDir = resolve(argv[index + 1] ?? '');
                index += 1;
                break;
            case '--input':
                args.input = resolve(argv[index + 1] ?? '');
                index += 1;
                break;
            case '--profile':
                args.profile = argv[index + 1] ?? '';
                index += 1;
                break;
            case '--sample-limit':
                args.sampleLimit = Number(argv[index + 1] ?? '40');
                index += 1;
                break;
            case '--json':
                args.json = true;
                break;
            case '--out':
                args.out = argv[index + 1] ?? '';
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

    if (!args.book) {
        throw new Error('--book is required');
    }

    if (!Number.isFinite(args.sampleLimit) || args.sampleLimit < 0) {
        throw new Error('--sample-limit must be a non-negative number');
    }

    return args;
};

const fileExists = async (path: string) => {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
};

const resolveInputPath = async (args: Args) => {
    if (args.input) {
        return args.input;
    }

    const candidate = join(args.booksDir, `${args.book}.json`);
    if (await fileExists(candidate)) {
        return candidate;
    }

    throw new Error(`Could not find ${args.book}.json. Pass --input or --books-dir.`);
};

const resolveProfile = async (profileRef: string, book: string) => {
    if (!profileRef) {
        const builtin = BUILTIN_PROFILES[book as DictionaryBookId];
        if (!builtin) {
            throw new Error(`No builtin profile for book ${book}; pass --profile`);
        }
        return builtin;
    }

    if (profileRef in BUILTIN_PROFILES) {
        return BUILTIN_PROFILES[profileRef as DictionaryBookId];
    }

    const [modulePath, exportName = 'default'] = profileRef.split('#');
    const resolved = modulePath.startsWith('.') ? new URL(modulePath, `file://${process.cwd()}/`).href : modulePath;
    const module = await import(resolved);
    const profile = module[exportName];
    if (!profile) {
        throw new Error(`Profile export "${exportName}" not found in ${modulePath}`);
    }
    return profile as ArabicDictionaryProfile;
};

const formatSummary = (book: string, diagnostics: ReturnType<typeof diagnoseDictionaryProfile>) => {
    const lines: string[] = [];
    lines.push(`book=${book}`);
    lines.push(`pages=${diagnostics.pageCount}`);
    lines.push(`accepted=${diagnostics.acceptedCount}`);
    lines.push(`rejected=${diagnostics.rejectedCount}`);
    lines.push('');
    lines.push('acceptedKinds:');
    for (const [kind, count] of Object.entries(diagnostics.acceptedKinds)) {
        lines.push(`  ${kind}: ${count}`);
    }
    lines.push('');
    lines.push('blockerHits:');
    for (const [reason, count] of Object.entries(diagnostics.blockerHits).sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )) {
        if (count > 0) {
            lines.push(`  ${reason}: ${count}`);
        }
    }
    lines.push('');
    lines.push('zoneCounts:');
    for (const [zone, counts] of Object.entries(diagnostics.zoneCounts)) {
        lines.push(`  ${zone}: accepted=${counts.accepted}, rejected=${counts.rejected}`);
    }
    lines.push('');
    lines.push('familyCounts:');
    for (const [family, counts] of Object.entries(diagnostics.familyCounts)) {
        lines.push(`  ${family}: accepted=${counts.accepted}, rejected=${counts.rejected}`);
    }
    lines.push('');
    lines.push('topRejectedLemmas:');
    for (const item of diagnostics.rejectedLemmas.slice(0, 20)) {
        lines.push(`  ${item.lemma}: ${item.count}`);
    }
    lines.push('');
    lines.push('samples:');
    for (const sample of diagnostics.samples) {
        const status = sample.accepted ? 'accepted' : `rejected:${sample.reason}`;
        lines.push(
            `  [${status}] page=${sample.pageId} zone=${sample.zone} family=${sample.family} lemma=${sample.lemma ?? ''}`,
        );
        lines.push(`    ${sample.text.split('\n', 1)[0]}`);
    }
    return lines.join('\n');
};

const args = parseArgs(process.argv.slice(2));
const inputPath = await resolveInputPath(args);
const profile = await resolveProfile(args.profile, args.book);
const source = (await Bun.file(inputPath).json()) as BookJson;
const preprocess = DICTIONARY_BOOK_OPTIONS[args.book as DictionaryBookId]?.preprocess ?? ['removeZeroWidth'];
const pages = source.pages.map((entry) => ({
    content: applyPreprocessToPage(convertContentToMarkdown(entry.content), entry.id, preprocess),
    id: entry.id,
}));
const diagnostics = diagnoseDictionaryProfile(pages, profile, { sampleLimit: args.sampleLimit });
const output = args.json ? JSON.stringify(diagnostics, null, 2) : formatSummary(args.book, diagnostics);

if (args.out) {
    await Bun.write(args.out, `${output}\n`);
} else {
    console.log(output);
}
