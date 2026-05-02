#!/usr/bin/env node

import { McpServer, StdioServerTransport } from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
    inspectBook,
    previewSegmentation,
    scoreSegmentationCandidates,
    suggestBookSegmentation,
    validateSegmentationPreview,
} from './tools.js';

const pageSchema = z.object({
    content: z.string(),
    id: z.number(),
});

const segmentSchema = z.object({
    content: z.string(),
    from: z.number(),
    meta: z.record(z.string(), z.unknown()).optional(),
    to: z.number().optional(),
});

const looseObjectSchema = z.object({}).catchall(z.unknown());
const pagesSchema = z.array(pageSchema);
const optionsSchema = looseObjectSchema;
const candidatesSchema = z.array(looseObjectSchema);
const outputSchema = looseObjectSchema;

const jsonResult = (payload: Record<string, unknown>) => ({
    content: [{ text: JSON.stringify(payload, null, 2), type: 'text' as const }],
    structuredContent: payload,
});

const server = new McpServer({
    name: 'flappa-doormal-mcp',
    version: '2.20.0',
});

server.registerTool(
    'inspect_book',
    {
        description:
            'Inspect a book of Arabic pages and return analysis hints: preprocess detections, line-start patterns, repeating sequences, and draft rule suggestions.',
        inputSchema: z.object({
            advisorOptions: looseObjectSchema.optional(),
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
        inputSchema: z.object({
            advisorOptions: looseObjectSchema.optional(),
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
        inputSchema: z.object({
            options: optionsSchema,
            pages: pagesSchema,
            sampleSegments: z.number().int().min(1).max(100).optional(),
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
        inputSchema: z.object({
            options: optionsSchema,
            pages: pagesSchema,
            segments: z.array(segmentSchema),
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
        inputSchema: z.object({
            candidates: candidatesSchema,
            pages: pagesSchema,
            sampleSegments: z.number().int().min(1).max(100).optional(),
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
