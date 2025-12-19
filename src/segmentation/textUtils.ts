/**
 * Strip all HTML tags from content, keeping only text.
 *
 * @param html - HTML content
 * @returns Plain text content
 */
export const stripHtmlTags = (html: string): string => {
    return html.replace(/<[^>]*>/g, '');
};

export type TitleSpanStrategy = 'splitLines' | 'merge' | 'hierarchy';

export type NormalizeTitleSpanOptions = {
    /**
     * How to handle adjacent `<span data-type="title">...</span>` runs.
     *
     * - `splitLines`: Keep each title span, but insert `\\n` between them so downstream conversion produces one header per line.
     * - `merge`: Merge adjacent title spans into a single title span, joining text with `separator`.
     * - `hierarchy`: Keep first title span as-is, convert subsequent adjacent title spans to `data-type="subtitle"` and insert `\\n` between them.
     */
    strategy: TitleSpanStrategy;
    /** Used only for `merge` strategy. Default: `' — '`. */
    separator?: string;
};

/**
 * Normalizes consecutive Shamela-style title spans.
 *
 * Shamela exports sometimes contain adjacent title spans like:
 * `<span data-type="title">باب الميم</span><span data-type="title">من اسمه محمد</span>`
 *
 * If you naively convert each title span into a markdown heading, you can end up with:
 * `## باب الميم ## من اسمه محمد` (two headings on one line).
 *
 * This helper rewrites the HTML so downstream HTML→Markdown conversion can stay simple and consistent.
 */
export const normalizeTitleSpans = (html: string, options: NormalizeTitleSpanOptions): string => {
    const { separator = ' — ', strategy } = options;
    if (!html) {
        return html;
    }

    const titleSpanRegex = /<span\b[^>]*\bdata-type=(["'])title\1[^>]*>[\s\S]*?<\/span>/gi;
    // Two or more title spans with optional whitespace between them
    const titleRunRegex = /(?:<span\b[^>]*\bdata-type=(["'])title\1[^>]*>[\s\S]*?<\/span>\s*){2,}/gi;

    return html.replace(titleRunRegex, (run) => {
        const spans = run.match(titleSpanRegex) ?? [];
        if (spans.length < 2) {
            return run;
        }

        if (strategy === 'splitLines') {
            return spans.join('\n');
        }

        if (strategy === 'merge') {
            const texts = spans
                .map((s) =>
                    s
                        .replace(/^<span\b[^>]*>/i, '')
                        .replace(/<\/span>$/i, '')
                        .trim(),
                )
                .filter(Boolean);

            // Preserve the first span's opening tag (attributes) but replace its inner text.
            const firstOpenTagMatch = spans[0].match(/^<span\b[^>]*>/i);
            const openTag = firstOpenTagMatch?.[0] ?? '<span data-type="title">';
            return `${openTag}${texts.join(separator)}</span>`;
        }

        // hierarchy
        const first = spans[0];
        const rest = spans.slice(1).map((s) => s.replace(/\bdata-type=(["'])title\1/i, 'data-type="subtitle"'));
        return [first, ...rest].join('\n');
    });
};

/**
 * Normalizes line endings to Unix-style (`\n`).
 *
 * Converts Windows (`\r\n`) and old Mac (`\r`) line endings to Unix style
 * for consistent pattern matching across platforms.
 *
 * @param content - Raw content with potentially mixed line endings
 * @returns Content with all line endings normalized to `\n`
 */
// OPTIMIZATION: Fast-path when no \r present (common case for Unix/Mac content)
export const normalizeLineEndings = (content: string) =>
    content.includes('\r') ? content.replace(/\r\n?/g, '\n') : content;
