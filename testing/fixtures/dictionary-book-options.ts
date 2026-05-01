import { PROFILE_1687, PROFILE_2553, PROFILE_7030, PROFILE_7031 } from '@/dictionary/profiles.js';
import type { ArabicDictionaryProfile } from '@/types/dictionary.js';
import type { PreprocessTransform, SegmentationOptions } from '@/types/options.js';

export type DictionaryBookId = '1687' | '2553' | '7030' | '7031';

export type DictionaryBookOptions = Pick<
    SegmentationOptions,
    'breakpoints' | 'dictionary' | 'maxPages' | 'preprocess'
> & {
    breakpoints: string[];
    dictionary: ArabicDictionaryProfile;
    maxPages: 1;
    preprocess: PreprocessTransform[];
};

const createDictionaryBookOptions = (dictionary: ArabicDictionaryProfile): DictionaryBookOptions => ({
    breakpoints: ['{{tarqim}}'],
    dictionary,
    maxPages: 1,
    preprocess: ['removeZeroWidth'],
});

export const DICTIONARY_BOOK_OPTIONS: Record<DictionaryBookId, DictionaryBookOptions> = {
    1687: createDictionaryBookOptions(PROFILE_1687),
    2553: createDictionaryBookOptions(PROFILE_2553),
    7030: createDictionaryBookOptions(PROFILE_7030),
    7031: createDictionaryBookOptions(PROFILE_7031),
};
