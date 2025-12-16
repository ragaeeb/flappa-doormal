import { describe, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { segmentPages } from './segmentation/segmenter';
import type { SplitRule } from './segmentation/types';

const loadPages = () => {
    const filePath = path.join(process.cwd(), 'test', '34.json');
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content).pages;
};

// 9 rules as mentioned in the handoff doc, mixed fuzzy and non-fuzzy
const rules: SplitRule[] = [
    { fuzzy: true, lineStartsWith: ['{{kitab}}'], meta: { type: 'book' }, split: 'at' },
    { fuzzy: true, lineStartsWith: ['{{bab}}'], meta: { type: 'chapter' }, split: 'at' },
    { fuzzy: true, lineStartsWith: ['{{fasl}}'], meta: { type: 'section' }, split: 'at' },
    { lineStartsAfter: ['{{numbered}}'], meta: { type: 'hadith' }, split: 'at' },
    { fuzzy: true, lineStartsWith: ['{{naql}}'], meta: { type: 'transmission' }, split: 'at' },
    { meta: { type: 'hadith_regex' }, regex: '^[٠-٩]+ - ', split: 'at' },
    { fuzzy: true, lineStartsWith: ['{{basmalah}}'], meta: { type: 'basmalah' }, split: 'at' },
    { lineStartsWith: ['{{tarqim}}'], meta: { type: 'punctuation' }, split: 'after' },
    { meta: { type: 'template_test' }, split: 'at', template: '{{raqms}} {{dash}}' },
];

describe('Performance Benchmark', () => {
    it('measures segmentation time', () => {
        const pages = loadPages();
        console.log(`Loaded ${pages.length} pages`);

        // Warmup
        segmentPages(pages.slice(0, 100), { rules });

        const start = performance.now();
        const segments = segmentPages(pages, { rules });
        const end = performance.now();
        const duration = end - start;

        console.log(`Segmentation took ${duration.toFixed(2)}ms`);
        console.log(`Generated ${segments.length} segments`);
    });
});
