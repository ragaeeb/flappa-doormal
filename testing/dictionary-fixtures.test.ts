import { describe, expect, it } from 'bun:test';
import { segmentPages } from '../src/segmentation/segmenter.js';
import { DICTIONARY_BOOK_OPTIONS, type DictionaryBookId } from './fixtures/dictionary-book-options.js';
import { loadDictionaryFixturePages } from './fixtures/dictionary-books.js';
import { DICTIONARY_FIXTURE_PAGE_IDS } from './fixtures/dictionary-fixture-manifest.js';
import { DICTIONARY_GOLDEN_SUMMARIES } from './fixtures/dictionary-golden-summaries.js';

const BOOK_IDS = Object.keys(DICTIONARY_FIXTURE_PAGE_IDS) as DictionaryBookId[];
const TEST_FILE_GLOBS = ['src/**/*.test.ts', 'testing/**/*.test.ts'];

type SegmentSummary = {
    count: number;
    firstSegments: Array<{
        from: number;
        head: string;
        kind: string | null;
        lemma: string | null;
        to?: number;
    }>;
    kindCounts: Record<string, number>;
};

const normalizeHead = (content: string) => content.split(/\s+/u).filter(Boolean).slice(0, 6).join(' ');

const summarizeSegments = (bookId: DictionaryBookId): Promise<SegmentSummary> =>
    loadDictionaryFixturePages(bookId, [...DICTIONARY_FIXTURE_PAGE_IDS[bookId]]).then((pages) => {
        const segments = segmentPages(pages, DICTIONARY_BOOK_OPTIONS[bookId]);
        const kindCounts: Record<string, number> = {};
        for (const segment of segments) {
            const kind = String(segment.meta?.kind ?? 'none');
            kindCounts[kind] = (kindCounts[kind] ?? 0) + 1;
        }

        return {
            count: segments.length,
            firstSegments: segments.slice(0, 8).map((segment) => ({
                from: segment.from,
                head: normalizeHead(segment.content),
                kind: typeof segment.meta?.kind === 'string' ? segment.meta.kind : null,
                lemma: typeof segment.meta?.lemma === 'string' ? segment.meta.lemma : null,
                ...(segment.to === undefined ? {} : { to: segment.to }),
            })),
            kindCounts,
        };
    });

describe('dictionary fixture regression coverage', () => {
    for (const bookId of BOOK_IDS) {
        it(`matches the committed golden summary for ${bookId}`, async () => {
            await expect(summarizeSegments(bookId)).resolves.toEqual(DICTIONARY_GOLDEN_SUMMARIES[bookId]);
        });

        it(`has direct fixture integrity for ${bookId}`, async () => {
            const expectedIds = [...DICTIONARY_FIXTURE_PAGE_IDS[bookId]];
            const pages = await loadDictionaryFixturePages(bookId, expectedIds);

            expect(pages.map((page) => page.id)).toEqual(expectedIds);
            expect(new Set(pages.map((page) => page.id)).size).toBe(expectedIds.length);
            expect(pages.every((page) => page.content.trim().length > 0)).toBe(true);
            expect(pages.every((page) => Object.keys(page).sort().join(',') === 'content,id')).toBe(true);
        });
    }

    it('does not allow focused test declarations to land', async () => {
        const matches = await Array.fromAsync(
            new Bun.Glob(`{${TEST_FILE_GLOBS.join(',')}}`).scan({ cwd: import.meta.dir.replace(/\/testing$/u, '') }),
        );

        for (const path of matches) {
            const text = await Bun.file(new URL(`../${path}`, import.meta.url)).text();
            expect(text).not.toMatch(/\b(?:describe|it|test)\.only\s*\(/u);
        }
    });
});
