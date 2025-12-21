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
export const normalizeLineEndings = (content: string) => {
    return content.includes('\r') ? content.replace(/\r\n?/g, '\n') : content;
};
