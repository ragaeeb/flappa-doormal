/**
 * Strip all HTML tags from content, keeping only text.
 *
 * @param html - HTML content
 * @returns Plain text content
 */
export const stripHtmlTags = (html: string): string => {
    return html.replace(/<[^>]*>/g, '');
};
