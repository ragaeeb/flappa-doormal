#!/usr/bin/env node

import { McpServer, StdioServerTransport } from '@modelcontextprotocol/server';
import * as v from 'valibot';
import { name, version } from '../../package.json';
import {
    inspectBook,
    previewSegmentation,
    scoreSegmentationCandidates,
    suggestBookSegmentation,
    validateSegmentationPreview,
} from './tools.js';

const pageSchema = v.object({
    content: v.string(),
    id: v.number(),
});

const segmentSchema = v.object({
    content: v.string(),
    from: v.number(),
    meta: v.optional(v.record(v.string(), v.unknown())),
    to: v.optional(v.number()),
});

const looseObjectSchema = v.record(v.string(), v.unknown());
const pagesSchema = v.array(pageSchema);
const optionsSchema = looseObjectSchema;
const candidatesSchema = v.array(looseObjectSchema);
const outputSchema = looseObjectSchema;

const jsonResult = (payload: Record<string, unknown>) => ({
    content: [{ text: JSON.stringify(payload, null, 2), type: 'text' as const }],
    structuredContent: payload,
});

const server = new McpServer({
    name: `${name}-mcp`,
    version,
});

server.registerTool(
    'inspect_book',
    {
        description:
            'Inspect a book of Arabic pages and return analysis hints: preprocess detections, line-start patterns, repeating sequences, and draft rule suggestions.',
        inputSchema: v.object({
            advisorOptions: v.optional(looseObjectSchema),
            pages: pagesSchema,
        }),
        outputSchema,
    },
    async ({ advisorOptions, pages }) =>
        jsonResult({
            report: inspectBook(pages, advisorOptions),
        }),
);

server.registerTool(
    'suggest_segmentation_options',
    {
        description:
            'Generate a draft segmentation report and recommended SegmentationOptions for a book of Arabic pages.',
        inputSchema: v.object({
            advisorOptions: v.optional(looseObjectSchema),
            pages: pagesSchema,
        }),
        outputSchema,
    },
    async ({ advisorOptions, pages }) =>
        jsonResult({
            report: suggestBookSegmentation(pages, advisorOptions),
        }),
);

server.registerTool(
    'preview_segmentation',
    {
        description:
            'Run segmentPages on a book with caller-supplied SegmentationOptions and return segments, samples, and validation.',
        inputSchema: v.object({
            options: optionsSchema,
            pages: pagesSchema,
            sampleSegments: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100))),
        }),
        outputSchema,
    },
    async ({ options, pages, sampleSegments }) =>
        jsonResult({
            preview: previewSegmentation(pages, options, sampleSegments),
        }),
);

server.registerTool(
    'validate_segmentation',
    {
        description:
            'Validate a caller-provided segmentation result against source pages and the SegmentationOptions used to produce it.',
        inputSchema: v.object({
            options: optionsSchema,
            pages: pagesSchema,
            segments: v.array(segmentSchema),
        }),
        outputSchema,
    },
    async ({ options, pages, segments }) =>
        jsonResult({
            validation: validateSegmentationPreview(pages, options, segments),
        }),
);

server.registerTool(
    'score_candidate_options',
    {
        description:
            'Evaluate multiple SegmentationOptions candidates against the same book and rank them using validation and segment-shape heuristics.',
        inputSchema: v.object({
            candidates: candidatesSchema,
            pages: pagesSchema,
            sampleSegments: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100))),
        }),
        outputSchema,
    },
    async ({ candidates, pages, sampleSegments }) =>
        jsonResult({
            ranking: scoreSegmentationCandidates(pages, candidates, sampleSegments),
        }),
);

const main = async () => {
    const transport = new StdioServerTransport();
    await server.connect(transport);
};

main().catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exit(1);
});
