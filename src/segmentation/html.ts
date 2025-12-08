/**
 * Convert Shamela HTML to Markdown format for easier pattern matching.
 *
 * Transformations:
 * - `<span data-type="title">text</span>` → `## text`
 * - `<a href="inr://...">text</a>` → `text` (strip narrator links)
 * - All other HTML tags → stripped
 *
 * Note: Content typically already has proper line breaks before title spans,
 * so we don't add extra newlines around the ## header.
 * Line ending normalization is handled by segmentPages.
 *
 * @param html - HTML content from Shamela
 * @returns Markdown-formatted content
 */
export const htmlToMarkdown = (html: string): string => {
    return (
        html
            // Convert title spans to markdown headers (no extra newlines - content already has them)
            .replace(/<span[^>]*data-type=["']title["'][^>]*>(.*?)<\/span>/gi, '## $1')
            // Strip narrator links but keep text
            .replace(/<a[^>]*href=["']inr:\/\/[^"']*["'][^>]*>(.*?)<\/a>/gi, '$1')
            // Strip all remaining HTML tags
            .replace(/<[^>]*>/g, '')
    );
};

/**
 * Strip all HTML tags from content, keeping only text.
 *
 * @param html - HTML content
 * @returns Plain text content
 */
export const stripHtmlTags = (html: string): string => {
    return html.replace(/<[^>]*>/g, '');
};
