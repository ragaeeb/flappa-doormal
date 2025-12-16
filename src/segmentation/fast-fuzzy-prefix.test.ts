import { describe, expect, it } from 'bun:test';
import { matchFuzzyLiteralPrefixAt } from './fast-fuzzy-prefix';

describe('fast-fuzzy-prefix', () => {
    it('matches Arabic prefix ignoring diacritics in content', () => {
        // بَابُ (with diacritics) should match bab
        const content = 'بَابُ الإيمان\nالتالي';
        const end = matchFuzzyLiteralPrefixAt(content, 0, 'باب');
        expect(end).not.toBeNull();
        expect(content.slice(0, end!)).toContain('ب');
    });

    it('treats alef variants as equivalent (أ/إ/آ/ا)', () => {
        const content = 'إيمان';
        expect(matchFuzzyLiteralPrefixAt(content, 0, 'ايمان')).not.toBeNull();
        const content2 = 'آثار';
        expect(matchFuzzyLiteralPrefixAt(content2, 0, 'اثار')).not.toBeNull();
    });

    it('treats ة/ه and ى/ي as equivalent', () => {
        expect(matchFuzzyLiteralPrefixAt('صلاه', 0, 'صلاة')).not.toBeNull();
        expect(matchFuzzyLiteralPrefixAt('فتى', 0, 'فتي')).not.toBeNull();
    });

    it('returns null when prefix does not match', () => {
        expect(matchFuzzyLiteralPrefixAt('كتاب', 0, 'باب')).toBeNull();
    });
});


