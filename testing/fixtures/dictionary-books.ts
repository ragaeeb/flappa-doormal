import type { Page } from '@/types/index.js';
import type { DictionaryFixtureBookId } from './dictionary-fixture-manifest.js';

type FixturePage = Page;
type FixtureBook = { pages: FixturePage[] };

const fixtureCache = new Map<DictionaryFixtureBookId, Promise<FixtureBook>>();

const fixturePathFor = (bookId: DictionaryFixtureBookId) =>
    new URL(`./dictionary-books/${bookId}.json`, import.meta.url);

const loadFixtureBook = (bookId: DictionaryFixtureBookId): Promise<FixtureBook> => {
    const cached = fixtureCache.get(bookId);
    if (cached) {
        return cached;
    }

    const pending = Bun.file(fixturePathFor(bookId)).json() as Promise<FixtureBook>;
    fixtureCache.set(bookId, pending);
    return pending;
};

export const loadDictionaryFixturePage = async (bookId: DictionaryFixtureBookId, id: number): Promise<Page> => {
    const fixture = await loadFixtureBook(bookId);
    const page = fixture.pages.find((entry) => entry.id === id);

    if (!page) {
        throw new Error(`Missing fixture page ${id} in dictionary fixture ${bookId}`);
    }

    return page;
};

export const loadDictionaryFixturePages = async (bookId: DictionaryFixtureBookId, ids: number[]): Promise<Page[]> => {
    const fixture = await loadFixtureBook(bookId);
    const idSet = new Set(ids);
    const pages = fixture.pages.filter((entry) => idSet.has(entry.id));

    if (pages.length !== idSet.size) {
        const foundIds = new Set(pages.map((page) => page.id));
        const missingIds = ids.filter((id) => !foundIds.has(id));
        throw new Error(`Missing fixture pages in ${bookId}: ${missingIds.join(', ')}`);
    }

    return pages;
};

export const loadDictionaryFixturePagesUpTo = async (
    bookId: DictionaryFixtureBookId,
    maxId: number,
): Promise<Page[]> => {
    const fixture = await loadFixtureBook(bookId);
    return fixture.pages.filter((entry) => entry.id <= maxId);
};
