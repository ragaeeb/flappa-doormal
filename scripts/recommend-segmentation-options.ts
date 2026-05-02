#!/usr/bin/env bun
import { resolve } from 'node:path';
import { suggestSegmentationOptions, type Page } from '../src/index.ts';

type Args = {
    format: 'json' | 'markdown';
    input: string;
    maxRules?: number;
    out: string;
    topLineStarts?: number;
    topRepeatingSequences?: number;
};

const usage = () => {
    console.error(`Usage:
  bun scripts/recommend-segmentation-options.ts --input ./pages.json
  bun scripts/recommend-segmentation-options.ts --input ./book.json --format markdown --out ./report.md

Options:
  --input <file>                 JSON file containing Page[] or { pages: Page[] }
  --format <json|markdown>       Output format (default: json)
  --out <file>                   Write output to a file instead of stdout
  --max-rules <n>                Limit recommended rules
  --top-line-starts <n>          Limit line-start candidates
  --top-repeating-sequences <n>  Limit repeating-sequence candidates
`);
};

const parseInteger = (value: string | undefined, flag: string) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error(`${flag} must be a non-negative integer`);
    }
    return parsed;
};

const parseArgs = (argv: string[]): Args => {
    const args: Args = {
        format: 'json',
        input: '',
        out: '',
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        switch (arg) {
            case '--input':
                args.input = resolve(argv[index + 1] ?? '');
                index += 1;
                break;
            case '--format': {
                const format = argv[index + 1] ?? '';
                if (format !== 'json' && format !== 'markdown') {
                    throw new Error('--format must be json or markdown');
                }
                args.format = format;
                index += 1;
                break;
            }
            case '--out':
                args.out = argv[index + 1] ?? '';
                index += 1;
                break;
            case '--max-rules':
                args.maxRules = parseInteger(argv[index + 1], '--max-rules');
                index += 1;
                break;
            case '--top-line-starts':
                args.topLineStarts = parseInteger(argv[index + 1], '--top-line-starts');
                index += 1;
                break;
            case '--top-repeating-sequences':
                args.topRepeatingSequences = parseInteger(argv[index + 1], '--top-repeating-sequences');
                index += 1;
                break;
            case '--help':
            case '-h':
                usage();
                process.exit(0);
                break;
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (!args.input) {
        throw new Error('--input is required');
    }

    return args;
};

const isPage = (value: unknown): value is Page =>
    !!value &&
    typeof value === 'object' &&
    typeof (value as Page).id === 'number' &&
    typeof (value as Page).content === 'string';

const readPages = async (inputPath: string): Promise<Page[]> => {
    const data = await Bun.file(inputPath).json();
    const pages = Array.isArray(data) ? data : data && typeof data === 'object' ? (data as { pages?: unknown }).pages : undefined;

    if (!Array.isArray(pages) || !pages.every(isPage)) {
        throw new Error('Input must be Page[] or { pages: Page[] }');
    }

    return pages;
};

const formatMarkdown = (report: ReturnType<typeof suggestSegmentationOptions>) => {
    const lines: string[] = [];
    lines.push('# Segmentation Advisor Report');
    lines.push('');
    lines.push(`- mode: \`${report.assessment.mode}\``);
    lines.push(`- reason: ${report.assessment.reason}`);
    lines.push('');

    lines.push('## Preprocess');
    lines.push('');
    if (report.preprocess.suggestions.length === 0) {
        lines.push('- none');
    } else {
        for (const suggestion of report.preprocess.suggestions) {
            lines.push(`- \`${suggestion.transform}\` (${suggestion.count}): ${suggestion.reason}`);
        }
    }
    lines.push('');

    lines.push('## Recommended Options');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(report.recommendedOptions, null, 2));
    lines.push('```');
    lines.push('');

    lines.push('## Rule Suggestions');
    lines.push('');
    for (const suggestion of report.ruleSuggestions.slice(0, 10)) {
        lines.push(
            `- [${suggestion.confidence}] ${suggestion.source} ${suggestion.pattern} (count=${suggestion.count}, page=${suggestion.example.pageId})`,
        );
        lines.push(`  example: ${suggestion.example.text}`);
    }
    lines.push('');

    if (report.evaluation) {
        lines.push('## Evaluation');
        lines.push('');
        lines.push(`- segments: ${report.evaluation.segmentCount}`);
        lines.push(`- multi-page segments: ${report.evaluation.multiPageSegments}`);
        lines.push(`- max segment length: ${report.evaluation.maxSegmentLength}`);
        lines.push(`- validation issues: ${report.evaluation.validation.summary.issues}`);
        lines.push('');
    }

    if (report.breakpointSuggestions.length > 0) {
        lines.push('## Breakpoint Suggestions');
        lines.push('');
        for (const suggestion of report.breakpointSuggestions) {
            lines.push(`- maxPages=${suggestion.maxPages}, prefer=${suggestion.prefer}: ${suggestion.reason}`);
            lines.push(`  breakpoints: ${JSON.stringify(suggestion.breakpoints)}`);
        }
        lines.push('');
    }

    return `${lines.join('\n')}\n`;
};

const args = parseArgs(process.argv.slice(2));
const pages = await readPages(args.input);
const report = suggestSegmentationOptions(pages, {
    maxRules: args.maxRules,
    topLineStarts: args.topLineStarts,
    topRepeatingSequences: args.topRepeatingSequences,
});
const output = args.format === 'markdown' ? formatMarkdown(report) : `${JSON.stringify(report, null, 2)}\n`;

if (args.out) {
    await Bun.write(args.out, output);
} else {
    console.log(output.trimEnd());
}
