import { describe, expect, it } from 'bun:test';
import { DICTIONARY_BOOK_OPTIONS, type DictionaryBookId } from '../../testing/fixtures/dictionary-book-options.js';

const BOOK_IDS = Object.keys(DICTIONARY_BOOK_OPTIONS) as DictionaryBookId[];

describe('dictionary book options', () => {
    it('exports all four builtin book ids', () => {
        expect(BOOK_IDS).toEqual(['1687', '2553', '7030', '7031']);
    });

    for (const bookId of BOOK_IDS) {
        it(`has expected options for ${bookId} and remains serializable`, () => {
            const options = DICTIONARY_BOOK_OPTIONS[bookId];

            expect(options.maxPages).toBe(1);
            expect(options.breakpoints).toEqual(['{{tarqim}}']);
            expect(options.preprocess).toEqual(['removeZeroWidth']);
            expect(JSON.parse(JSON.stringify(options))).toEqual(options);
        });
    }
});
