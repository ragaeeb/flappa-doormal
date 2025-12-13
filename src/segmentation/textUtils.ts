/**
 * Strip all HTML tags from content, keeping only text.
 *
 * @param html - HTML content
 * @returns Plain text content
 */
export const stripHtmlTags = (html: string): string => {
    return html.replace(/<[^>]*>/g, '');
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
