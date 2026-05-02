import { describe, expect, it } from 'bun:test';
import type { ArabicDictionaryProfile } from '@/types/dictionary.js';
import type { Page } from '@/types/index.js';
import type { PageMap } from '../types/segmenter.js';
import {
    buildPageLines,
    createPageContexts,
    createZoneActivationMap,
    headingMatchesGate,
    resolveActiveZone,
} from './dictionary-zones.js';
import { normalizeDictionaryProfile } from './profile.js';

const createPageMap = (pages: Page[]): PageMap => {
    const boundaries = pages.map((page, index) => ({
        end: index * 100 + page.content.length,
        id: page.id,
        start: index * 100,
    }));

    return {
        boundaries,
        getId: (offset: number) => {
            for (const boundary of boundaries) {
                if (offset >= boundary.start && offset <= boundary.end) {
                    return boundary.id;
                }
            }
            return boundaries.at(-1)?.id ?? -1;
        },
        pageBreaks: boundaries.slice(1).map((boundary) => boundary.start),
        pageIds: pages.map((page) => page.id),
    };
};

describe('dictionary-zones', () => {
    it('should build line metadata with stable offsets for each line', () => {
        const lines = buildPageLines('alpha\nbeta\n');

        expect(lines).toEqual([
            { lineNumber: 1, start: 0, text: 'alpha' },
            { lineNumber: 2, start: 6, text: 'beta' },
            { lineNumber: 3, start: 11, text: '' },
        ]);
    });

    it('should match heading gates for exact, fuzzy, and token-based prefixes', () => {
        expect(headingMatchesGate('باب', { match: 'باب', use: 'headingText' })).toBe(true);
        expect(headingMatchesGate('بابية', { match: 'باب', use: 'headingText' })).toBe(false);
        expect(headingMatchesGate('بَابُ الهمزة', { fuzzy: true, match: 'باب', use: 'headingText' })).toBe(true);
        expect(headingMatchesGate('فَصْل الهمزة', { token: 'fasl', use: 'headingToken' })).toBe(true);
    });

    it('should activate and resolve zones only within their page bounds', () => {
        const profile: ArabicDictionaryProfile = {
            version: 2,
            zones: [
                {
                    families: [{ classes: ['entry'], emit: 'entry', use: 'heading' }],
                    name: 'main',
                },
                {
                    families: [{ classes: ['chapter'], emit: 'chapter', use: 'heading' }],
                    name: 'late',
                    when: {
                        activateAfter: [{ fuzzy: true, match: 'باب', use: 'headingText' }],
                        maxPageId: 8,
                        minPageId: 5,
                    },
                },
            ],
        };
        const normalizedProfile = normalizeDictionaryProfile(profile);
        const pages: Page[] = [
            { content: '## باب قبل المدى', id: 4 },
            { content: '## باب بعد المدى', id: 9 },
            { content: '## بَابُ الهمزة', id: 6 },
        ];

        const pageContexts = createPageContexts(pages, createPageMap(pages));
        const activationMap = createZoneActivationMap(normalizedProfile, pageContexts);

        expect(activationMap.get('late')).toBe(6);
        expect(resolveActiveZone(normalizedProfile, activationMap, 4)?.name).toBe('main');
        expect(resolveActiveZone(normalizedProfile, activationMap, 6)?.name).toBe('late');
        expect(resolveActiveZone(normalizedProfile, activationMap, 9)?.name).toBe('main');
    });

    it('should normalize CRLF content and honor provided normalizedPages overrides', () => {
        const pages: Page[] = [{ content: 'alpha\r\nbeta', id: 1 }];
        const pageMap = createPageMap(pages);

        const normalizedFromContent = createPageContexts(pages, pageMap);
        expect(normalizedFromContent[0]?.content).toBe('alpha\nbeta');
        expect(normalizedFromContent[0]?.lines).toEqual([
            { lineNumber: 1, start: 0, text: 'alpha' },
            { lineNumber: 2, start: 6, text: 'beta' },
        ]);

        const overridden = createPageContexts(pages, pageMap, ['normalized body']);
        expect(overridden[0]?.content).toBe('normalized body');
        expect(overridden[0]?.lines).toEqual([{ lineNumber: 1, start: 0, text: 'normalized body' }]);
    });

    it('should reject mismatched normalized-page and boundary counts', () => {
        const pages: Page[] = [
            { content: 'first', id: 1 },
            { content: 'second', id: 2 },
        ];

        expect(() => createPageContexts(pages, createPageMap(pages), ['only one normalized page'])).toThrow(
            'Dictionary runtime expected 2 normalized pages, received 1',
        );
        expect(() =>
            createPageContexts(pages, {
                ...createPageMap(pages),
                boundaries: createPageMap(pages).boundaries.slice(0, 1),
            }),
        ).toThrow('Dictionary runtime expected 2 page boundaries, received 1');
    });
});
