import './style.css';
import { getSegmentDebugReason, segmentPages, type Page, type Segment } from 'flappa-doormal';
import { DEFAULT_PRESET_ID, DEMO_PRESETS, type DemoPreset } from './demo-presets';

interface AppState {
    error?: string;
    pages: Page[];
    segments: Segment[];
    selectedPresetId: string;
    selectedSegmentIndex: number;
}

const app = document.getElementById('app');

if (!app) {
    throw new Error('Missing #app root');
}

const presetMap = new Map(DEMO_PRESETS.map((preset) => [preset.id, preset] as const));
const initialPreset = presetMap.get(DEFAULT_PRESET_ID) ?? DEMO_PRESETS[0];

if (!initialPreset) {
    throw new Error('No demo presets configured');
}

const clonePages = (preset: DemoPreset): Page[] => preset.pages.map((page) => ({ ...page }));

const state: AppState = {
    pages: clonePages(initialPreset),
    segments: [],
    selectedPresetId: initialPreset.id,
    selectedSegmentIndex: 0,
};

const escapeHtml = (value: string) =>
    value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

const containsArabic = (text: string) => /[\u0600-\u06ff]/u.test(text);

const textDirection = (text: string) => (containsArabic(text) ? 'rtl' : 'ltr');

const truncate = (value: string, maxLength: number) =>
    value.length <= maxLength ? value : `${value.slice(0, maxLength - 3).trimEnd()}...`;

const selectedPreset = () => presetMap.get(state.selectedPresetId) ?? initialPreset;

const getKind = (segment: Segment) => (typeof segment.meta?.kind === 'string' ? segment.meta.kind : 'plain');

const formatReason = (segment: Segment) => {
    const reason = getSegmentDebugReason(segment);
    return !reason || reason === 'Unknown' ? '-' : reason;
};

const getMetaText = (segment: Segment) => {
    const pairs = Object.entries(segment.meta ?? {}).filter(
        ([key, value]) => key !== '_flappa' && value !== undefined && typeof value !== 'object',
    );
    if (pairs.length === 0) {
        return '-';
    }
    return pairs.map(([key, value]) => `${key}: ${String(value)}`).join(' | ');
};

const getPageInputs = (): Page[] =>
    [...app.querySelectorAll<HTMLTextAreaElement>('[data-page-id]')]
        .map((textarea) => ({
            content: textarea.value,
            id: Number(textarea.dataset.pageId),
        }))
        .filter((page) => Number.isFinite(page.id) && page.content.trim().length > 0);

const processCurrentText = () => {
    const preset = selectedPreset();
    const pages = getPageInputs();

    try {
        state.pages = pages;
        state.segments = segmentPages(pages, preset.options);
        state.selectedSegmentIndex = 0;
        state.error = undefined;
    } catch (error) {
        state.segments = [];
        state.selectedSegmentIndex = 0;
        state.error = error instanceof Error ? error.message : 'Unknown segmentation error';
    }

    render();
};

const switchPreset = (presetId: string) => {
    const preset = presetMap.get(presetId);
    if (!preset) {
        return;
    }

    state.selectedPresetId = preset.id;
    state.pages = clonePages(preset);
    state.segments = [];
    state.selectedSegmentIndex = 0;
    state.error = undefined;
    render();
};

const renderPresetTabs = () => `
    <nav class="preset-tabs" aria-label="Demo presets">
        ${DEMO_PRESETS.map(
            (preset) => `
                <button
                    class="preset-tab ${preset.id === state.selectedPresetId ? 'active' : ''}"
                    data-preset-id="${escapeHtml(preset.id)}"
                    type="button"
                >
                    <span>${escapeHtml(preset.title)}</span>
                    <small>${escapeHtml(preset.group.replace(' Examples', ''))}</small>
                </button>
            `,
        ).join('')}
    </nav>
`;

const renderSourceEditors = (pages: Page[]) => `
    <div class="source-editors">
        ${pages
            .map(
                (page) => `
                    <label class="source-editor">
                        <span>Page ${page.id}</span>
                        <textarea
                            data-page-id="${page.id}"
                            dir="${textDirection(page.content)}"
                            spellcheck="false"
                        >${escapeHtml(page.content)}</textarea>
                    </label>
                `,
            )
            .join('')}
    </div>
`;

const renderOptions = (preset: DemoPreset) => `
    <div class="option-strip">
        ${preset.optionCards
            .map(
                (card) => `
                    <div class="option-item">
                        <span>${escapeHtml(card.label)}</span>
                        <code>${escapeHtml(card.value)}</code>
                    </div>
                `,
            )
            .join('')}
    </div>
`;

const renderResults = () => {
    if (state.error) {
        return `<div class="empty error">${escapeHtml(state.error)}</div>`;
    }

    if (state.segments.length === 0) {
        return '<div class="empty">Press Process to segment the current text.</div>';
    }

    return `
        <div class="table-wrap">
            <table class="segments-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Pages</th>
                        <th>Kind</th>
                        <th>Meta</th>
                        <th>Content</th>
                    </tr>
                </thead>
                <tbody>
                    ${state.segments
                        .map((segment, index) => {
                            const pageSpan =
                                segment.to !== undefined && segment.to !== segment.from
                                    ? `${segment.from}-${segment.to}`
                                    : `${segment.from}`;
                            const content = truncate(segment.content.replace(/\s+/gu, ' ').trim(), 220);
                            return `
                                <tr class="${index === state.selectedSegmentIndex ? 'selected' : ''}" data-segment-index="${index}">
                                    <td>${index + 1}</td>
                                    <td>${escapeHtml(pageSpan)}</td>
                                    <td>${escapeHtml(getKind(segment))}</td>
                                    <td>${escapeHtml(getMetaText(segment))}</td>
                                    <td dir="${textDirection(segment.content)}"><span class="content-preview">${escapeHtml(content)}</span></td>
                                </tr>
                            `;
                        })
                        .join('')}
                </tbody>
            </table>
        </div>
    `;
};

const renderSelectedSegment = () => {
    const segment = state.segments[state.selectedSegmentIndex];
    if (!segment) {
        return '<div class="segment-detail empty">No segment selected.</div>';
    }

    const pageSpan =
        segment.to !== undefined && segment.to !== segment.from ? `${segment.from}-${segment.to}` : `${segment.from}`;

    return `
        <div class="segment-detail">
            <div class="detail-bar">
                <strong>Segment ${state.selectedSegmentIndex + 1}</strong>
                <span>pages ${escapeHtml(pageSpan)}</span>
                <span>${escapeHtml(getKind(segment))}</span>
                <span>${escapeHtml(getMetaText(segment))}</span>
                <span>${escapeHtml(formatReason(segment))}</span>
            </div>
            <pre dir="${textDirection(segment.content)}">${escapeHtml(segment.content)}</pre>
        </div>
    `;
};

const render = () => {
    const preset = selectedPreset();
    const segmentCount = state.segments.length;
    const pageCount = state.pages.length;
    const crossPageCount = state.segments.filter(
        (segment) => segment.to !== undefined && segment.to !== segment.from,
    ).length;

    app.innerHTML = `
        <main class="demo-shell">
            <header class="topbar">
                <div>
                    <h1>flappa-doormal demo</h1>
                    <p>${escapeHtml(preset.summary)}</p>
                </div>
                <button class="process-button" id="process-button" type="button">Process</button>
            </header>

            ${renderPresetTabs()}

            <section class="config-row">
                <div class="preset-meta">
                    <strong>${escapeHtml(preset.title)}</strong>
                    <span>${escapeHtml(preset.sourceFile)}</span>
                </div>
                ${renderOptions(preset)}
                <div class="stats">
                    <span>${pageCount} pages</span>
                    <span>${segmentCount} segments</span>
                    <span>${crossPageCount} cross-page</span>
                </div>
            </section>

            <section class="workspace-grid">
                <section class="input-pane">
                    ${renderSourceEditors(state.pages)}
                </section>
                <section class="output-pane">
                    ${renderResults()}
                    ${renderSelectedSegment()}
                </section>
            </section>
        </main>
    `;

    app.querySelectorAll<HTMLButtonElement>('[data-preset-id]').forEach((button) => {
        button.addEventListener('click', () => switchPreset(button.dataset.presetId ?? ''));
    });

    app.querySelector<HTMLButtonElement>('#process-button')?.addEventListener('click', processCurrentText);

    app.querySelectorAll<HTMLTableRowElement>('[data-segment-index]').forEach((row) => {
        row.addEventListener('click', () => {
            state.selectedSegmentIndex = Number(row.dataset.segmentIndex) || 0;
            render();
        });
    });
};

render();
