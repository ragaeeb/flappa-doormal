import type { Page } from '@/types/index.js';
import type { DictionaryFixtureBookId } from './dictionary-fixture-manifest.js';

type FixturePage = Page;
type FixtureBook = { pages: FixturePage[] };

const fixtureCache = new Map<DictionaryFixtureBookId, Promise<FixtureBook>>();

const fixturePathFor = (bookId: DictionaryFixtureBookId) =>
    new URL(`./dictionary-books/${bookId}.json`, import.meta.url);

const assertFixturePage = (
    bookId: DictionaryFixtureBookId,
    page: FixturePage | undefined,
    index: number,
    seenIds: Set<number>,
) => {
    if (!page || typeof page !== 'object') {
        throw new Error(`Invalid dictionary fixture ${bookId}: page ${index} is not an object`);
    }
    if (!Number.isInteger(page.id) || page.id <= 0) {
        throw new Error(`Invalid dictionary fixture ${bookId}: page ${index} has invalid id`);
    }
    if (seenIds.has(page.id)) {
        throw new Error(`Invalid dictionary fixture ${bookId}: duplicate page id ${page.id}`);
    }
    if (typeof page.content !== 'string' || page.content.length === 0) {
        throw new Error(`Invalid dictionary fixture ${bookId}: page ${page.id} has empty content`);
    }
    const extraKeys = Object.keys(page).filter((key) => key !== 'id' && key !== 'content');
    if (extraKeys.length > 0) {
        throw new Error(
            `Invalid dictionary fixture ${bookId}: page ${page.id} has unexpected keys ${extraKeys.join(', ')}`,
        );
    }
    seenIds.add(page.id);
};

const validateFixtureBook = (bookId: DictionaryFixtureBookId, value: unknown): FixtureBook => {
    if (!value || typeof value !== 'object' || !Array.isArray((value as FixtureBook).pages)) {
        throw new Error(`Invalid dictionary fixture ${bookId}: expected { pages: Page[] }`);
    }

    const seenIds = new Set<number>();
    for (const [index, page] of (value as FixtureBook).pages.entries()) {
        assertFixturePage(bookId, page, index, seenIds);
    }

    return value as FixtureBook;
};

const loadFixtureBook = (bookId: DictionaryFixtureBookId): Promise<FixtureBook> => {
    const cached = fixtureCache.get(bookId);
    if (cached) {
        return cached;
    }

    const pending = Bun.file(fixturePathFor(bookId))
        .json()
        .then((value) => validateFixtureBook(bookId, value))
        .catch((error) => {
            fixtureCache.delete(bookId);
            throw error;
        });
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
