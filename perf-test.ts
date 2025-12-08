import { segmentPages } from './src/segmentation/segmenter';
import type { PageInput } from './src/segmentation/types';

const NUM_PAGES = 50000;
const PAGE_SIZE = 1000; // 1KB per page -> 50MB total

console.log(`Generating ${NUM_PAGES} pages of ${PAGE_SIZE} bytes each...`);
const pages: PageInput[] = [];
for (let i = 0; i < NUM_PAGES; i++) {
    // Add some Arabic text to trigger fuzzy matching logic
    pages.push({
        content: `Page ${i + 1} content. حدثنا Abdullah about something. ${'x'.repeat(PAGE_SIZE - 50)}\n`,
        id: i + 1,
    });
}

console.log('Starting segmentation with complex rules...');
const start = performance.now();
const startMem = process.memoryUsage().heapUsed;

const segments = segmentPages(pages, {
    rules: [
        {
            fuzzy: true,
            // Complex rule: fuzzy match, token expansion, capture
            lineStartsAfter: ['{{narrated}} {{harf}}'],
            meta: { type: 'hadith' },
            split: 'before',
        },
    ],
});

const endMem = process.memoryUsage().heapUsed;
const end = performance.now();

console.log(`Segmentation took ${(end - start).toFixed(2)}ms`);
console.log(`Memory used: ${((endMem - startMem) / 1024 / 1024).toFixed(2)} MB`);
console.log(`Generated ${segments.length} segments`);
