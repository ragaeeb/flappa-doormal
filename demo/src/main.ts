import './style.css';
import {
    analyzeCommonLineStarts,
    createArabicDictionaryEntryRule,
    getSegmentDebugReason,
    type Page,
    type Segment,
    type SegmentationOptions,
    type SplitRule,
    segmentPages,
} from 'flappa-doormal';
import { dependencies } from '../package.json';

const version = dependencies['flappa-doormal'];

// ============================================
// Types
// ============================================
interface PageData {
    id: number;
    content: string;
    element: HTMLElement;
}

interface RuleData {
    id: number;
    element: HTMLElement;
}

interface DemoRulePreset {
    fuzzy?: boolean;
    metaType?: string;
    max?: number;
    min?: number;
    pageStartGuard?: string;
    pageStartPrevWordStoplist?: string[];
    samePagePrevWordStoplist?: string[];
    pattern: string;
    patternType: PatternType;
    split?: 'at' | 'after';
}

interface DemoPreset {
    breakpoints?: string[];
    debug?: boolean;
    maxPages?: number;
    pageJoiner?: 'space' | 'newline';
    pages: Array<{ content: string; id: number }>;
    prefer?: 'longer' | 'shorter';
    rules: DemoRulePreset[];
}

type PatternType = 'lineStartsWith' | 'lineStartsAfter' | 'lineEndsWith' | 'template' | 'regex' | 'dictionaryEntry';

// ============================================
// State
// ============================================
const pages: PageData[] = [];
const rules: RuleData[] = [];
let pageIdCounter = 1;
let ruleIdCounter = 1;

// ============================================
// DOM Elements
// ============================================
const pagesContainer = document.getElementById('pages-container')!;
const addPageBtn = document.getElementById('add-page-btn')!;
const rulesContainer = document.getElementById('rules-container')!;
const addRuleBtn = document.getElementById('add-rule-btn')!;
const segmentBtn = document.getElementById('segment-btn')!;
const resultsContainer = document.getElementById('results-container')!;
const resultStats = document.getElementById('result-stats')!;
const analysisContainer = document.getElementById('analysis-container')!;
const exampleSelect = document.getElementById('example-select') as HTMLSelectElement;
const loadExampleBtn = document.getElementById('load-example-btn') as HTMLButtonElement;

// Analysis config
const analysisConfigToggle = document.getElementById('analysis-config-toggle')!;
const analysisConfig = document.getElementById('analysis-config')!;
const topKInput = document.getElementById('topK') as HTMLInputElement;
const minCountInput = document.getElementById('minCount') as HTMLInputElement;
const sortBySelect = document.getElementById('sortBy') as HTMLSelectElement;
const whitespaceSelect = document.getElementById('whitespace') as HTMLSelectElement;

// Global options
const maxPagesInput = document.getElementById('max-pages') as HTMLInputElement;
const maxContentLengthInput = document.getElementById('max-content-length') as HTMLInputElement;
const breakpointsTextarea = document.getElementById('breakpoints') as HTMLTextAreaElement;
const preferSelect = document.getElementById('prefer') as HTMLSelectElement;
const pageJoinerSelect = document.getElementById('page-joiner') as HTMLSelectElement;
const debugToggle = document.getElementById('debug-toggle') as HTMLInputElement;

// Preprocess
const preRemoveZW = document.getElementById('pre-remove-zw') as HTMLInputElement;
const preCondenseEllipsis = document.getElementById('pre-condense-ellipsis') as HTMLInputElement;
const preFixWaw = document.getElementById('pre-fix-waw') as HTMLInputElement;

const dictionaryLemmaStopWords = Array.from(
    new Set(
        `ويقال|الحديث|أي|قال|وقال|يقول|فيقال|وقيل|قلت|أقول|وتقول|قوله|يعني|يقولون|ويروى|يقال|فقال|وقالوا|يريد|وقوله|ويروي|وهي|وقولهم|أراد|والفعل|تقول|معناه|ومنه|وهو|أما|وجل|تعالى|والجميع|قالوا|ورأ|ويقرأ|والواحد|الواحدة|قَالَ|وَمِنْهُم|قلتُ|فَقَالَ|وَكَذَلِكَ|وَقَالَ|يَقُول|وَقيل|قُلت|يُرِيد|وَيُقَال|اللحياني|أَرَادَ|الْأَصْمَعِي|وَتقول|اللَّيْث|وَقَوله|قيل|الأصمعيّ|اللِّحياني|وَالْجمع|وأمّا|اللحيانيُّ|يَعْنِي|شمر|قَالُوا|وَأنْشد|يُقَال|مَعْنَاهُ|وَيقال|الفرّاء|قَوْله|وَيَقُول|وأنشدنا|اللِّحيانيّ|فَمَعْنَاه|فَيُقَال|الْمَعْنى|وَيَقُولُونَ|الْفراء|قَالَت|أَحدهَا|أَحدهمَا|وَقَالُوا|ويُقال|وقرىء|غَيره|وقالَ|قالَ|الأصمعيُّ|الليثُ|اللَّيث|شمِر|ويقالُ|والضَّحْك|شَمِر|ويُروَى|قُلتُ|ويُقَالُ|قُلْتُ|ثَعْلَب|ويُرْوَى|فَقَالَت|يقالُ|يقولُ|وَقَوْلهمْ|أَي|اللحيانيّ|اللّحيانيّ|إِحْدَاهمَا|وَالِاسْم|ويُروى|والواحدة|وقولُه|فَقَالُوا|غيرُه|وَمَعْنَاهُ|الْكسَائي|وَمعنى|فَقلت|شَمِرٌ|تَقول|وَالثَّانِي|يُقال|وتقولُ|والجميعُ|تقولُ|وَالْمعْنَى|وَمِنْه|والفِعْل|والإخْلاَفُ|وأَنشد|وَمثله|وأنشَد|وجَمْعُه|وتَقُولُ|وَهِي|أيْ|وَيُقالُ|ويُقالُ|وَالْفِعْل|قولُه|والطَبَق|وَالثَّالِث|قلتَ|والكَلُّ|والمكْرةُ|وَمِنْهَا|قَالَا|وأَنْشد|اللّيث|وأَنشَد|شَمر|أَراد|يُريد|الفَرّاء|والفِعل|وَجَمعهَا|الْوَاحِدَة|وَجمعه|ويُجمع|والأَلْب|والبال|وأَلْوى|والأُمّة|مِنْهُم|وفيهَا|فَمِنْهَا|العجاج|العجّاج|أخاك`.split(
            '|',
        ),
    ),
);
const dictionaryLemmaPrevWordStoplist = ['قال', 'وقال', 'وقيل', 'ويقال', 'يقال', 'قلت', 'فقال', 'قالوا'];
const dictionaryLemmaSamePagePrevWordStoplist = ['جل'];
const demoPresets: Record<string, DemoPreset> = {
    'dictionary-lemma': {
        debug: true,
        maxPages: 1,
        pageJoiner: 'space',
        pages: [
            {
                content: [
                    '## باب العين والزاي (ع ز، ز ع مستعملان)',
                    'عز: العزَّة لله تبارك وتعالى، والله العزيز يُعِزُّ من يشاء ويُذِلُّ من يشاء.',
                    'والعزَّاءُ: السَّنة الشَّديدةُ، قال العجَّاجُ: «٢»',
                    'وقيل: هي الشدة والعَزُوزُ: الشاةُ الضيِّقةُ الإحْليل التي لا تدرُّ بحلبة.',
                    'والمُعازَّةُ: المُغالَبة في العِزِّ.',
                ].join('\n'),
                id: 66,
            },
            {
                content: [
                    '## باب العين واللام (ع ل، ل ع مستعملان)',
                    'والعُلْعُلُ: اسمُ الذَّكر، وهو رأْسُ الرَّهابة أيضاً، والعَلْعَالُ: الذَّكرُ من القنابر.',
                    'ويقال: عَلَّ أخاك: أي لعلَّ أخاك.',
                    'لع: قال زائدةُ: جاءت الإبلُ تُلَعْلِعُ في كلأٍ خفيفٍ.',
                    'واللُّعْلَعُ: السَّاب نفسه. واللَّعْلَعَةُ: بصيصه. والتَّلَعْلُعُ: التَّلأْلُؤُ.',
                ].join('\n'),
                id: 79,
            },
        ],
        prefer: 'longer',
        rules: [
            {
                metaType: 'chapter',
                pattern: '## ',
                patternType: 'lineStartsAfter',
                split: 'at',
            },
            {
                metaType: 'entry',
                pageStartPrevWordStoplist: dictionaryLemmaPrevWordStoplist,
                pattern: dictionaryLemmaStopWords.join(', '),
                patternType: 'dictionaryEntry',
                samePagePrevWordStoplist: dictionaryLemmaSamePagePrevWordStoplist,
                split: 'at',
            },
        ],
    },
};

// ============================================
// Page Management
// ============================================
function createPageElement(id: number): HTMLElement {
    const pageItem = document.createElement('div');
    pageItem.className = 'page-item';
    pageItem.dataset.pageId = String(id);

    pageItem.innerHTML = `
    <div class="page-header">
      <span class="page-label">Page</span>
      <input type="number" class="page-id-input" value="${id}" min="1" title="Page ID" />
      <button class="page-remove-btn" title="Remove">✕</button>
    </div>
    <textarea class="page-textarea" placeholder="Paste Arabic text here..."></textarea>
  `;

    const idInput = pageItem.querySelector('.page-id-input') as HTMLInputElement;
    const textarea = pageItem.querySelector('.page-textarea') as HTMLTextAreaElement;
    const removeBtn = pageItem.querySelector('.page-remove-btn') as HTMLButtonElement;

    idInput.addEventListener('change', () => {
        const pageData = pages.find((p) => p.element === pageItem);
        if (pageData) {
            pageData.id = parseInt(idInput.value, 10) || 1;
        }
    });

    // Instant analysis on text change
    textarea.addEventListener('input', () => {
        const pageData = pages.find((p) => p.element === pageItem);
        if (pageData) {
            pageData.content = textarea.value;
        }
        updateAnalysis();
    });

    removeBtn.addEventListener('click', () => {
        if (pages.length > 1) {
            const index = pages.findIndex((p) => p.element === pageItem);
            if (index !== -1) {
                pages.splice(index, 1);
                pageItem.remove();
                updateAnalysis();
            }
        }
    });

    return pageItem;
}

function addPage(): void {
    const id = pageIdCounter++;
    const element = createPageElement(id);
    pagesContainer.appendChild(element);
    pages.push({ content: '', element, id });
}

function getPages(): Page[] {
    return pages.map((p) => ({ content: p.content, id: p.id }));
}

// ============================================
// Rule Management
// ============================================
function createRuleElement(id: number): HTMLElement {
    const ruleItem = document.createElement('div');
    ruleItem.className = 'rule-item';
    ruleItem.dataset.ruleId = String(id);

    ruleItem.innerHTML = `
    <div class="rule-header">
      <span class="rule-title">Rule ${id}</span>
      <button class="rule-remove-btn" title="Remove">✕</button>
    </div>
    <div class="rule-row">
      <div class="form-group">
        <label>Pattern Type</label>
        <select class="rule-pattern-type">
          <option value="lineStartsWith">lineStartsWith</option>
          <option value="lineStartsAfter" selected>lineStartsAfter</option>
          <option value="lineEndsWith">lineEndsWith</option>
          <option value="template">template</option>
          <option value="regex">regex</option>
          <option value="dictionaryEntry">dictionaryEntry</option>
        </select>
      </div>
      <div class="form-group">
        <label>Split</label>
        <select class="rule-split">
          <option value="at" selected>at</option>
          <option value="after">after</option>
        </select>
      </div>
    </div>
    <div class="form-group full-width">
      <label>Pattern</label>
      <input type="text" class="rule-pattern" placeholder="{{raqms:num}} {{dash}} " value="{{raqms:num}} {{dash}} " />
    </div>
    <div class="rule-row-3">
      <div class="form-group">
        <label>Min Page</label>
        <input type="number" class="rule-min" placeholder="-" />
      </div>
      <div class="form-group">
        <label>Max Page</label>
        <input type="number" class="rule-max" placeholder="-" />
      </div>
      <div class="form-group">
        <label>Meta Type</label>
        <input type="text" class="rule-meta" placeholder="hadith" />
      </div>
    </div>
	    <div class="rule-row">
	      <div class="checkbox-inline">
	        <input type="checkbox" class="rule-fuzzy" id="fuzzy-${id}" />
	        <label for="fuzzy-${id}">Fuzzy</label>
	      </div>
	      <div class="form-group">
	        <label>Page Guard</label>
	        <input type="text" class="rule-guard" placeholder="{{tarqim}}" />
	      </div>
	    </div>
	    <div class="form-group full-width">
	      <label>Prev Page Word Stoplist</label>
	      <input type="text" class="rule-prev-word-stoplist" placeholder="قال, وقيل, ويقال" />
	    </div>
	    <div class="form-group full-width">
	      <label>Same-Page Prev Word Stoplist</label>
	      <input type="text" class="rule-same-page-prev-word-stoplist" placeholder="جل" />
	    </div>
	  `;

    const removeBtn = ruleItem.querySelector('.rule-remove-btn') as HTMLButtonElement;
    removeBtn.addEventListener('click', () => {
        if (rules.length > 1) {
            const index = rules.findIndex((r) => r.element === ruleItem);
            if (index !== -1) {
                rules.splice(index, 1);
                ruleItem.remove();
                updateRuleNumbers();
            }
        }
    });

    return ruleItem;
}

function addRule(): void {
    const id = ruleIdCounter++;
    const element = createRuleElement(id);
    rulesContainer.appendChild(element);
    rules.push({ element, id });
}

function addRuleWithPattern(pattern: string): void {
    const id = ruleIdCounter++;
    const element = createRuleElement(id);
    rulesContainer.appendChild(element);
    rules.push({ element, id });

    // Set the pattern value
    const patternInput = element.querySelector('.rule-pattern') as HTMLInputElement;
    if (patternInput) {
        patternInput.value = pattern;
    }

    // Scroll to the rules container
    rulesContainer.scrollTop = rulesContainer.scrollHeight;
}

function addRuleFromPreset(rule: DemoRulePreset): void {
    const id = ruleIdCounter++;
    const element = createRuleElement(id);
    rulesContainer.appendChild(element);
    rules.push({ element, id });

    (element.querySelector('.rule-pattern-type') as HTMLSelectElement).value = rule.patternType;
    (element.querySelector('.rule-pattern') as HTMLInputElement).value = rule.pattern;
    (element.querySelector('.rule-split') as HTMLSelectElement).value = rule.split ?? 'at';
    (element.querySelector('.rule-fuzzy') as HTMLInputElement).checked = rule.fuzzy ?? false;
    (element.querySelector('.rule-meta') as HTMLInputElement).value = rule.metaType ?? '';
    (element.querySelector('.rule-min') as HTMLInputElement).value =
        rule.min !== undefined && rule.min !== null ? String(rule.min) : '';
    (element.querySelector('.rule-max') as HTMLInputElement).value =
        rule.max !== undefined && rule.max !== null ? String(rule.max) : '';
    (element.querySelector('.rule-guard') as HTMLInputElement).value = rule.pageStartGuard ?? '';
    (element.querySelector('.rule-prev-word-stoplist') as HTMLInputElement).value =
        rule.pageStartPrevWordStoplist?.join(', ') ?? '';
    (element.querySelector('.rule-same-page-prev-word-stoplist') as HTMLInputElement).value =
        rule.samePagePrevWordStoplist?.join(', ') ?? '';
}

function updateRuleNumbers(): void {
    rules.forEach((rule, index) => {
        const title = rule.element.querySelector('.rule-title');
        if (title) {
            title.textContent = `Rule ${index + 1}`;
        }
    });
}

function clearPages(): void {
    pages.length = 0;
    pagesContainer.innerHTML = '';
}

function clearRules(): void {
    rules.length = 0;
    rulesContainer.innerHTML = '';
}

function loadPreset(preset: DemoPreset): void {
    clearPages();
    clearRules();

    pageIdCounter = 1;
    ruleIdCounter = 1;

    for (const page of preset.pages) {
        const element = createPageElement(page.id);
        pagesContainer.appendChild(element);
        const textarea = element.querySelector('.page-textarea') as HTMLTextAreaElement;
        const idInput = element.querySelector('.page-id-input') as HTMLInputElement;
        textarea.value = page.content;
        idInput.value = String(page.id);
        pages.push({ content: page.content, element, id: page.id });
        pageIdCounter = Math.max(pageIdCounter, page.id + 1);
    }

    for (const rule of preset.rules) {
        addRuleFromPreset(rule);
    }

    maxPagesInput.value = preset.maxPages !== undefined && preset.maxPages !== null ? String(preset.maxPages) : '';
    maxContentLengthInput.value = '';
    preferSelect.value = preset.prefer ?? 'longer';
    pageJoinerSelect.value = preset.pageJoiner ?? 'space';
    debugToggle.checked = preset.debug ?? true;
    breakpointsTextarea.value = preset.breakpoints?.join('\n') ?? '';
    preRemoveZW.checked = false;
    preCondenseEllipsis.checked = false;
    preFixWaw.checked = false;

    updateRuleNumbers();
    updateAnalysis();
    clearResults();
}

function buildRuleFromElement(element: HTMLElement): SplitRule {
    const patternType = (element.querySelector('.rule-pattern-type') as HTMLSelectElement).value as PatternType;
    const pattern = (element.querySelector('.rule-pattern') as HTMLInputElement).value.trim();
    const split = (element.querySelector('.rule-split') as HTMLSelectElement).value as 'at' | 'after';
    const min = (element.querySelector('.rule-min') as HTMLInputElement).value;
    const max = (element.querySelector('.rule-max') as HTMLInputElement).value;
    const metaType = (element.querySelector('.rule-meta') as HTMLInputElement).value.trim();
    const fuzzy = (element.querySelector('.rule-fuzzy') as HTMLInputElement).checked;
    const guard = (element.querySelector('.rule-guard') as HTMLInputElement).value.trim();
    const prevWordStoplist = (element.querySelector('.rule-prev-word-stoplist') as HTMLInputElement).value
        .split(',')
        .map((word) => word.trim())
        .filter(Boolean);
    const samePagePrevWordStoplist = (
        element.querySelector('.rule-same-page-prev-word-stoplist') as HTMLInputElement
    ).value
        .split(',')
        .map((word) => word.trim())
        .filter(Boolean);

    const baseOptions: Partial<SplitRule> = { split };

    if (fuzzy) {
        baseOptions.fuzzy = true;
    }
    if (min) {
        baseOptions.min = parseInt(min, 10);
    }
    if (max) {
        baseOptions.max = parseInt(max, 10);
    }
    if (metaType) {
        baseOptions.meta = { type: metaType };
    }
    if (guard) {
        baseOptions.pageStartGuard = guard;
    }
    if (prevWordStoplist.length > 0) {
        baseOptions.pageStartPrevWordStoplist = prevWordStoplist;
    }
    if (samePagePrevWordStoplist.length > 0) {
        baseOptions.samePagePrevWordStoplist = samePagePrevWordStoplist;
    }

    switch (patternType) {
        case 'lineStartsWith':
            return { ...baseOptions, lineStartsWith: [pattern] } as SplitRule;
        case 'lineStartsAfter':
            return { ...baseOptions, lineStartsAfter: [pattern] } as SplitRule;
        case 'lineEndsWith':
            return { ...baseOptions, lineEndsWith: [pattern] } as SplitRule;
        case 'template':
            return { ...baseOptions, template: pattern } as SplitRule;
        case 'regex':
            return { ...baseOptions, regex: pattern } as SplitRule;
        case 'dictionaryEntry':
            return {
                ...baseOptions,
                ...createArabicDictionaryEntryRule({
                    pageStartPrevWordStoplist: prevWordStoplist,
                    samePagePrevWordStoplist,
                    stopWords: pattern
                        .split(',')
                        .map((word) => word.trim())
                        .filter(Boolean),
                }),
            } as SplitRule;
        default:
            return { ...baseOptions, lineStartsAfter: [pattern] } as SplitRule;
    }
}

function buildAllRules(): SplitRule[] {
    return rules.map((r) => buildRuleFromElement(r.element));
}

function buildOptions(): SegmentationOptions {
    const options: SegmentationOptions = {
        debug: debugToggle.checked,
        pageJoiner: pageJoinerSelect.value as 'space' | 'newline',
        prefer: preferSelect.value as 'longer' | 'shorter',
        rules: buildAllRules(),
    };

    if (maxPagesInput.value) {
        options.maxPages = parseInt(maxPagesInput.value, 10);
    }

    if (maxContentLengthInput.value) {
        options.maxContentLength = parseInt(maxContentLengthInput.value, 10);
    }

    const preprocess: any[] = [];
    if (preRemoveZW.checked) {
        preprocess.push('removeZeroWidth');
    }
    if (preCondenseEllipsis.checked) {
        preprocess.push('condenseEllipsis');
    }
    if (preFixWaw.checked) {
        preprocess.push('fixTrailingWaw');
    }

    if (preprocess.length > 0) {
        options.preprocess = preprocess;
    }

    // Parse breakpoints as newline-separated array
    if (breakpointsTextarea.value.trim()) {
        options.breakpoints = breakpointsTextarea.value
            .split('\n')
            .map((s) => s.trim())
            .filter((s) => s !== undefined); // Keep empty strings as page boundary fallback
    }

    return options;
}

// ============================================
// Analysis - Instant Update
// ============================================
let analysisDebounce: number | null = null;

function updateAnalysis(): void {
    if (analysisDebounce) {
        clearTimeout(analysisDebounce);
    }
    analysisDebounce = window.setTimeout(() => {
        const pageData = getPages().filter((p) => p.content.trim());
        if (pageData.length === 0) {
            analysisContainer.innerHTML = '<div class="empty-state">Type text to see detected patterns</div>';
            return;
        }

        try {
            const patterns = analyzeCommonLineStarts(pageData, {
                maxExamples: 2,
                minCount: parseInt(minCountInput.value, 10) || 1,
                sortBy: sortBySelect.value as 'count' | 'specificity',
                topK: parseInt(topKInput.value, 10) || 10,
                whitespace: whitespaceSelect.value as 'regex' | 'space',
            });

            if (patterns.length === 0) {
                analysisContainer.innerHTML = '<div class="empty-state">No patterns found</div>';
                return;
            }

            analysisContainer.innerHTML = patterns
                .map(
                    (p, idx) => `
          <div class="analysis-item" data-pattern-idx="${idx}" data-pattern="${escapeHtml(p.pattern)}">
            <div class="analysis-header">
              <span class="analysis-pattern">${escapeHtml(p.pattern)}</span>
              <span class="analysis-count">${p.count}</span>
            </div>
          </div>
        `,
                )
                .join('');

            // Add click handlers to create rules from patterns
            analysisContainer.querySelectorAll('.analysis-item').forEach((item) => {
                item.addEventListener('click', () => {
                    const pattern = (item as HTMLElement).dataset.pattern || '';
                    addRuleWithPattern(pattern);
                });
            });
        } catch {
            analysisContainer.innerHTML = '<div class="empty-state">Analysis error</div>';
        }
    }, 200);
}

// ============================================
// Results Rendering
// ============================================
function clearResults(): void {
    resultsContainer.innerHTML = '';
    resultStats.textContent = '';
}

function showEmptyState(msg = 'No results'): void {
    resultsContainer.innerHTML = `<div class="empty-state"><p>${msg}</p></div>`;
}

function renderSegments(segments: Segment[]): void {
    clearResults();

    if (segments.length === 0) {
        showEmptyState('No segments found');
        return;
    }

    resultStats.textContent = `${segments.length} segment${segments.length !== 1 ? 's' : ''}`;

    const table = document.createElement('table');
    table.className = 'results-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>#</th>
          <th>Pages</th>
          <th>Debug Reason</th>
          <th>Content</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody')!;

    segments.forEach((segment, index) => {
        const row = document.createElement('tr');

        const pagesText = segment.to ? `${segment.from}–${segment.to}` : `${segment.from}`;
        const debugReason = getSegmentDebugReason(segment);
        const content = escapeHtml(segment.content);

        row.innerHTML = `
            <td class="index-cell">${index + 1}</td>
            <td class="pages-cell">${pagesText}</td>
            <td class="debug-cell">${escapeHtml(debugReason)}</td>
            <td class="content-cell">${content}</td>
        `;
        tbody.appendChild(row);
    });

    resultsContainer.appendChild(table);
}

function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// Action Handlers
// ============================================
function handleSegment(): void {
    const pageData = getPages().filter((p) => p.content.trim());
    if (pageData.length === 0) {
        showEmptyState('Add text first');
        return;
    }

    try {
        const options = buildOptions();
        console.log('Options:', options);
        const segments = segmentPages(pageData, options);
        renderSegments(segments);
    } catch (error) {
        showEmptyState(`Error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
}

// ============================================
// Initialize
// ============================================
function init(): void {
    // Display version
    const versionEl = document.getElementById('version');
    if (versionEl) {
        versionEl.textContent = `v${version.replace(/\^/g, '')}`;
    }

    addPage();
    addRule();

    addPageBtn.addEventListener('click', addPage);
    addRuleBtn.addEventListener('click', addRule);
    segmentBtn.addEventListener('click', handleSegment);
    loadExampleBtn.addEventListener('click', () => {
        const preset = demoPresets[exampleSelect.value];
        if (preset) {
            loadPreset(preset);
        }
    });

    // Analysis config toggle
    analysisConfigToggle.addEventListener('click', () => {
        analysisConfig.classList.toggle('hidden');
    });

    // Re-analyze when config changes
    topKInput.addEventListener('change', updateAnalysis);
    minCountInput.addEventListener('change', updateAnalysis);
    sortBySelect.addEventListener('change', updateAnalysis);
    whitespaceSelect.addEventListener('change', updateAnalysis);

    updateAnalysis();
}

init();
