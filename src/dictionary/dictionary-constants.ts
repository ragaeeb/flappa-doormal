/**
 * Shared constants used by the dictionary runtime: phrase lists, regex patterns,
 * keyword sets, and structural-leak detection data.
 *
 * Keeping these here allows both runtime.ts and heading-classifier.ts to import
 * from a single source of truth without circular dependencies.
 */

import { ARABIC_WORD_WITH_OPTIONAL_MARKS_PATTERN, getTokenPattern } from '../segmentation/tokens.js';

export const INTRO_PHRASES = [
    'وقال',
    'قال',
    'وفي الحديث',
    'في الحديث',
    'وفي حديث',
    'في حديث',
    'وفي رواية',
    'في رواية',
    'وفي قراءة',
    'في قراءة',
    'وفي قول',
    'في قول',
    'وفي كلام',
    'في كلام',
    'ومنه قول',
    'ومنها قول',
    'وقرأ',
    'قرأ',
    'قراءة',
    'حديث',
    'ويقال',
    'وقيل',
    'قلت',
    'فقال',
    'قال الشاعر',
    'أنشد',
    'وأنشد',
];

export const INTRO_TAIL_PHRASES = [
    'بفتح',
    'بالفتح',
    'بكسر',
    'بالكسر',
    'بضم',
    'بالضم',
    'بالتحريك',
    'حديث',
    'الحديث',
    'في التنزيل',
    'وفي التنزيل',
    'في التنزيل العزيز',
    'وفي التنزيل العزيز',
    'في مقتل',
    'وفي مقتل',
    'في المجاز',
    'وفي المجاز',
    'من المجاز',
    'ومن المجاز',
    'في رواية',
    'وفي رواية',
    'في قراءة',
    'وفي قراءة',
    'في قول',
    'وفي قول',
    'في كلام',
    'وفي كلام',
    'في صفة',
    'وفي صفة',
    'في خطبته',
    'وفي خطبته',
    'ومنه قول',
    'ومنها قول',
    'يقال لرقبة',
    'على جهتين',
    'قوله جل',
    'قوله جل وعز',
    'جل وعز',
    'ومنه حديث',
    'ومنه الحديث',
    'كرم الله',
    'صلى الله عليه',
    'رضي الله عنه',
    'رضي الله عنها',
    'رضي الله عنهما',
    'قال ابو',
    'وقال ابو',
    'عن ابي',
    'قال ابن',
    'وقال ابن',
    'عن ابن',
];

export const INTRO_TAIL_PATTERNS = [
    /(?:^|\s)(?:في|وفي|ومنه|ومنها)\s+(?:حديث|الحديث|رواية|قراءة|قول|كلام|مقتل|صفة|خطبته)(?:\s+\S+){0,8}$/u,
    /(?:^|\s)(?:حديث|الحديث|رواية|قراءة|قول|كلام)(?:\s+\S+){1,8}$/u,
    /(?:^|\s)(?:قوله|قول(?:ه|هم)?|قال(?:\s+قائل)?|وقرأ|قرأ|قراءة)\s+(?:جل(?:\s+وعز)?|[^\s]+)$/u,
    /(?:^|\s)(?:ابو|ابي|ابا|ابن|بن|بنت)(?:\s+\S+){1,4}$/u,
    /(?:^|\s)(?:قال|وقال|انشد|وانشد|روي|وروي|اخبر|واخبر)(?:\s+\S+){0,4}$/u,
];

export const QUALIFIER_TAIL_PREFIXES = [
    'أي',
    'قال',
    'تقول',
    'يقال',
    'يقول',
    'يريد',
    'يُريد',
    'ويقال',
    'ويقول',
    'وجمعه',
    'وجمعها',
    'والجميع',
    'والجمع',
];

export const STRUCTURAL_LEMMA_PREFIXES = ['لجزء', 'جزء', 'ومما يستدرك عليه', 'آخر حرف', 'كتاب حرف'];

export const STRUCTURAL_LINE_PATTERNS = [/^\d+\s*-\s*\(.+\)$/u, /^\(.+\)$/u, /^\(.+\)\s*##\s*/u];

export const STRUCTURAL_LINE_KEYWORDS = ['باب', 'فصل', 'حرف', 'أبواب', 'كتاب', 'المعجمة', 'المهملة', 'المثناة'];

export const CONTINUATION_PREV_WORDS = [
    'بفتح',
    'بالفتح',
    'بكسر',
    'بالكسر',
    'بضم',
    'بالضم',
    'بالتحريك',
    'قال',
    'وقال',
    'وقيل',
    'ويقال',
    'يقال',
    'قلت',
    'فقال',
    'قالوا',
    'من',
    'في',
    'على',
    'إذا',
    'نحو',
    'ثم',
    'وجل',
];

export const AUTHORITY_RE =
    /^(?:(?:و)?قال\s+(?:أبو|ابن|ثعلب|الليث|الأزهري|الجوهري|الفراء)\b|(?:أبو|ابن|ثعلب|الليث|الأزهري|الجوهري|الفراء)\s+\S+)/u;

export const AUTHORITY_HEAD_WORDS = [
    'الأزهري',
    'الأصمعي',
    'الأشجعي',
    'الأموي',
    'الأمويّ',
    'الجوهري',
    'الرياشي',
    'الزجاج',
    'الزجاجي',
    'الشيباني',
    'الفراء',
    'الكسائي',
    'اللحياني',
    'الليث',
    'المبرد',
    'المنذري',
    'ثعلب',
    'شمر',
];

/** Aggressive-precision authority terms (subset used for fast startsWith checks). */
export const AUTHORITY_AGGRESSIVE_TERMS = ['الليث', 'الأزهري', 'الأصمعي', 'الجوهري', 'الفراء', 'ثعلب', 'شمر'];

export const STRONG_SENTENCE_TERMINATORS = /[.!?؟؛۔…]$/u;

export const TRAILING_PAGE_WRAP_NOISE = /[\s\u0660-\u0669\d«»""'''()[\]{}<>]+$/u;

export const TRAILING_WORD_DELIMITERS = /[\s\u0660-\u0669\d«»""'''()[\]{}<>.,!?؟؛،:]+$/u;

export const ARABIC_WORD_REGEX = new RegExp(ARABIC_WORD_WITH_OPTIONAL_MARKS_PATTERN, 'gu');

export const HEADING_PREFIX = '## ';

export const CODE_LINE_PATTERN = getTokenPattern('harfs').replaceAll('\\s+', '[ \\t]+');

export const BARE_CODE_LEMMA_RE = new RegExp(`^(?:${CODE_LINE_PATTERN})$`, 'u');

export const STATUS_TAIL_PATTERN = '(?:مستعمل|مستعملة|مستعملان|مهمل|مهملة)';

export const GATE_TOKEN_MAP = {
    bab: 'باب',
    fasl: 'فصل',
    kitab: 'كتاب',
} as const;

export const GATE_DELIMITER_RE = /[\s:،؛()[\]{}\-–—]/u;
