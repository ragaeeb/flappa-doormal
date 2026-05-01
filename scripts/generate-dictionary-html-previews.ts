#!/usr/bin/env bun
import { access, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { convertContentToMarkdown } from 'shamela';
import { removeArabicNumericPageMarkers, splitPageBodyFromFooter } from 'shamela/content';
import { segmentPages } from '../src/index.ts';
import { DICTIONARY_BOOK_OPTIONS, type DictionaryBookId } from '../testing/fixtures/dictionary-book-options.ts';

type BookPage = { content: string; id: number };
type BookJson = { pages: BookPage[] };
type Segment = ReturnType<typeof segmentPages>[number];
type KindCode = 'c' | 'e' | 'm' | 'n';

const ROOT = resolve(import.meta.dir, '..');
const DEFAULT_BOOKS_DIR = process.env.FLAPPA_BOOKS_DIR
    ? resolve(process.env.FLAPPA_BOOKS_DIR)
    : join(ROOT, 'books');
const DEFAULT_OUT_DIR = join(ROOT, 'docs', 'dictionary-html');
const BOOK_IDS = Object.keys(DICTIONARY_BOOK_OPTIONS) as DictionaryBookId[];

const KIND_CODE: Record<string, KindCode> = {
    chapter: 'c',
    entry: 'e',
    marker: 'm',
    none: 'n',
};

const usage = () => {
    console.error(`Usage:
  bun scripts/generate-dictionary-html-previews.ts --books-dir /path/to/books
  bun scripts/generate-dictionary-html-previews.ts --books-dir /path/to/books --book 1687 --book 2553
  bun scripts/generate-dictionary-html-previews.ts --books-dir /path/to/books --out-dir /path/to/output
`);
};

const parseArgs = (argv: string[]) => {
    const selectedBooks = new Set<DictionaryBookId>();
    let booksDir = DEFAULT_BOOKS_DIR;
    let outDir = DEFAULT_OUT_DIR;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        switch (arg) {
            case '--books-dir':
                booksDir = resolve(argv[index + 1] ?? '');
                index += 1;
                break;
            case '--out-dir':
                outDir = resolve(argv[index + 1] ?? '');
                index += 1;
                break;
            case '--book': {
                const bookId = (argv[index + 1] ?? '') as DictionaryBookId;
                if (!BOOK_IDS.includes(bookId)) {
                    throw new Error(`Unknown book id: ${bookId}`);
                }
                selectedBooks.add(bookId);
                index += 1;
                break;
            }
            case '--help':
            case '-h':
                usage();
                process.exit(0);
                break;
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return {
        bookIds: selectedBooks.size > 0 ? [...selectedBooks] : BOOK_IDS,
        booksDir,
        outDir,
    };
};

const fileExists = async (path: string) => {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
};

const escapeHtml = (value: string | number) =>
    String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

const countByKind = (segments: Segment[]) => {
    const counts = new Map<string, number>();
    for (const segment of segments) {
        const kind = segment.meta?.kind ?? 'none';
        counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
};

const renderStats = (segments: Segment[]) => {
    const stats = countByKind(segments)
        .map(([kind, count]) => `<li><strong>${escapeHtml(kind)}</strong>: ${count.toLocaleString()}</li>`)
        .join('\n');
    return `<ul class="stats">\n${stats}\n</ul>`;
};

const renderRows = (segments: Segment[]) =>
    segments
        .map((segment, index) => {
            const kind = segment.meta?.kind ?? '';
            const lemma = segment.meta?.lemma ?? '';
            const to = segment.to ?? '';

            return `
        <tr data-kind="${escapeHtml(kind)}" data-lemma="${escapeHtml(lemma)}">
          <td class="num">${index + 1}</td>
          <td class="num">${segment.from}</td>
          <td class="num">${to}</td>
          <td>${escapeHtml(kind)}</td>
          <td class="rtl">${escapeHtml(lemma)}</td>
          <td class="rtl text">${escapeHtml(segment.content)}</td>
        </tr>`;
        })
        .join('\n');

const csvEscape = (value: string) => `"${value.replaceAll('"', '""')}"`;

const flattenForCsv = (text: string) => text.replaceAll('\r', '').replaceAll('\n', '\\n').trim();

const renderCsv = (segments: Segment[]) => {
    const lines = ['i,from,to,k,l,t'];
    for (const [index, segment] of segments.entries()) {
        const kind = segment.meta?.kind ?? 'none';
        const lemma = segment.meta?.lemma ?? '';
        const to = segment.to ?? '';
        lines.push(
            [
                index + 1,
                segment.from,
                to,
                KIND_CODE[kind] ?? 'n',
                csvEscape(flattenForCsv(lemma)),
                csvEscape(flattenForCsv(segment.content)),
            ].join(','),
        );
    }
    return `${lines.join('\n')}\n`;
};

const renderHtml = (file: string, segments: Segment[]) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(file)} Segments</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f3ea;
      --panel: #fffdf7;
      --ink: #17120d;
      --muted: #6f6257;
      --line: #d7c7b4;
      --accent: #9a3f1f;
      --accent-soft: #f6e3d8;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, sans-serif;
      color: var(--ink);
      background: linear-gradient(180deg, #efe5d8 0%, var(--bg) 100%);
    }
    header {
      position: sticky;
      top: 0;
      z-index: 10;
      padding: 16px 20px;
      border-bottom: 1px solid var(--line);
      background: color-mix(in srgb, var(--panel) 92%, white);
      backdrop-filter: blur(10px);
    }
    h1 {
      margin: 0 0 8px;
      font-size: 22px;
    }
    p.meta {
      margin: 0 0 12px;
      color: var(--muted);
      font-size: 14px;
    }
    .controls {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      align-items: center;
    }
    input, select {
      padding: 8px 10px;
      border: 1px solid var(--line);
      background: white;
      border-radius: 8px;
      font: inherit;
    }
    main {
      padding: 20px;
    }
    .summary {
      margin-bottom: 16px;
      padding: 16px;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: var(--panel);
    }
    .stats {
      margin: 8px 0 0;
      padding-left: 20px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 6px 18px;
    }
    .table-shell {
      border: 1px solid var(--line);
      border-radius: 14px;
      background: var(--panel);
      overflow: hidden;
    }
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      table-layout: fixed;
    }
    thead th {
      background: var(--accent-soft);
      color: var(--ink);
      text-align: left;
      font-weight: 700;
    }
    th, td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
      font-size: 14px;
    }
    tbody tr:last-child td {
      border-bottom: 0;
    }
    tr:nth-child(2n) { background: #fffaf1; }
    td.num, th.num {
      width: 72px;
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    td.rtl {
      direction: rtl;
      unicode-bidi: plaintext;
      text-align: right;
    }
    td.text {
      white-space: pre-wrap;
      line-height: 1.65;
      font-family: "Amiri", "Noto Naskh Arabic", "Scheherazade New", serif;
      font-size: 18px;
      overflow-wrap: anywhere;
    }
    td.kind, th.kind { width: 110px; white-space: nowrap; }
    td.lemma, th.lemma { width: 200px; }
    .hidden { display: none; }
    .count {
      color: var(--muted);
      font-size: 13px;
      margin-left: auto;
    }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(file)}</h1>
    <p class="meta">Full segmentation dump generated from the committed internal dictionary profile. Arabic content is rendered in RTL with preserved line breaks.</p>
    <div class="controls">
      <input id="query" type="search" placeholder="Filter by lemma/content" />
      <select id="kind">
        <option value="">All kinds</option>
        <option value="chapter">chapter</option>
        <option value="entry">entry</option>
        <option value="marker">marker</option>
        <option value="none">none</option>
      </select>
      <span id="count" class="count"></span>
    </div>
  </header>
  <main>
    <section class="summary">
      <strong>Total segments:</strong> ${segments.length.toLocaleString()}
      ${renderStats(segments)}
    </section>
    <div class="table-shell">
      <table>
        <thead>
          <tr>
            <th class="num">#</th>
            <th class="num">from</th>
            <th class="num">to</th>
            <th class="kind">kind</th>
            <th class="lemma">lemma</th>
            <th>content</th>
          </tr>
        </thead>
        <tbody id="rows">
          ${renderRows(segments)}
        </tbody>
      </table>
    </div>
  </main>
  <script>
    const query = document.getElementById('query');
    const kind = document.getElementById('kind');
    const count = document.getElementById('count');
    const rows = [...document.querySelectorAll('#rows tr')];

    const apply = () => {
      const q = query.value.trim().toLowerCase();
      const selectedKind = kind.value;
      let visible = 0;

      for (const row of rows) {
        const lemma = (row.dataset.lemma || '').toLowerCase();
        const rowKind = row.dataset.kind || '';
        const text = row.textContent.toLowerCase();
        const matchesKind = !selectedKind || rowKind === selectedKind;
        const matchesQuery = !q || lemma.includes(q) || text.includes(q);
        const show = matchesKind && matchesQuery;
        row.classList.toggle('hidden', !show);
        if (show) visible += 1;
      }

      count.textContent = visible.toLocaleString() + ' visible';
    };

    query.addEventListener('input', apply);
    kind.addEventListener('change', apply);
    apply();
  </script>
</body>
</html>
`;

const preprocessBookPages = (source: BookJson) =>
    source.pages.map((page) => {
        const [body] = splitPageBodyFromFooter(page.content);
        const cleanedBody = removeArabicNumericPageMarkers(body);
        return {
            content: convertContentToMarkdown(cleanedBody),
            id: page.id,
        };
    });

const args = parseArgs(process.argv.slice(2));
await mkdir(args.outDir, { recursive: true });

for (const bookId of args.bookIds) {
    const inputPath = join(args.booksDir, `${bookId}.json`);
    if (!(await fileExists(inputPath))) {
        throw new Error(`Missing book file: ${inputPath}`);
    }

    const source = (await Bun.file(inputPath).json()) as BookJson;
    const pages = preprocessBookPages(source);
    const options = DICTIONARY_BOOK_OPTIONS[bookId];
    const segments = segmentPages(pages, options);
    const html = renderHtml(`${bookId}.json`, segments);
    const csv = renderCsv(segments);
    const htmlPath = join(args.outDir, `${bookId}.html`);
    const csvPath = join(args.outDir, `${bookId}.csv`);

    await mkdir(dirname(htmlPath), { recursive: true });
    await Bun.write(htmlPath, html);
    await Bun.write(csvPath, csv);

    console.log(`${bookId}.json: ${segments.length.toLocaleString()} segments`);
    console.log(`  html -> ${htmlPath}`);
    console.log(`  csv  -> ${csvPath}`);
}
