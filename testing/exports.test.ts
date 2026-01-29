import { describe, expect, it } from 'bun:test';
// Import Types to verify they are exported correctly
import type {
    // Core Types
    Breakpoint,
    BreakpointRule,
    // Analysis
    CommonLineStartPattern,
    // Options
    CondenseEllipsisRule,
    // Detection
    DetectedPattern,
    // Segmenter
    ExpandResult,
    FixTrailingWawRule,
    LineStartAnalysisOptions,
    LineStartPatternExample,
    Logger,
    // Recovery
    MarkerRecoveryReport,
    MarkerRecoveryRun,
    MarkerRecoverySelector,
    // Optimization
    OptimizeResult,
    Page,
    PageRange,
    PageRangeConstraint,
    PageRangeConstraintWithExclude,
    // Segmentation & Breakpoints
    PatternProcessor,
    // Rules
    PatternTypeKey,
    PreprocessTransform,
    RemoveZeroWidthRule,
    RepeatingSequenceExample,
    RepeatingSequenceOptions,
    RepeatingSequencePattern,
    // Rule Validation (pattern-validator.ts)
    RuleValidationResult,
    // Segment Validation (types/index.ts)
    Segment,
    SegmentationOptions,
    SegmentValidationIssue,
    SegmentValidationIssueSeverity,
    SegmentValidationIssueType,
    SegmentValidationReport,
    SplitRule,
    TokenKey,
    TokenMapping,
    ValidationIssue,
    ValidationIssueType,
    ValidationOptions,
} from '../dist/index.mjs';
import * as flappa from '../dist/index.mjs';

describe('Build Exports Validation', () => {
    it('should export all expected functions and constants from the main bundle', () => {
        // Analysis
        expect(flappa.analyzeCommonLineStarts).toBeFunction();
        expect(flappa.analyzeRepeatingSequences).toBeFunction();

        // Detection
        expect(flappa.analyzeTextForRule).toBeFunction();
        expect(flappa.detectTokenPatterns).toBeFunction();
        expect(flappa.generateTemplateFromText).toBeFunction();
        expect(flappa.suggestPatternConfig).toBeFunction();

        // Optimization
        expect(flappa.optimizeRules).toBeFunction();

        // Preprocessing
        expect(flappa.applyPreprocessToPage).toBeFunction();
        expect(flappa.condenseEllipsis).toBeFunction();
        expect(flappa.fixTrailingWaw).toBeFunction();
        expect(flappa.removeZeroWidth).toBeFunction();

        // Recovery
        expect(flappa.recoverMistakenLineStartsAfterMarkers).toBeFunction();
        expect(flappa.recoverMistakenMarkersForRuns).toBeFunction();

        // Breakpoint Utils
        expect(flappa.escapeWordsOutsideTokens).toBeFunction();

        // Pattern Validator
        expect(flappa.formatValidationReport).toBeFunction();
        expect(flappa.validateRules).toBeFunction();

        // Segmenter
        expect(flappa.segmentPages).toBeFunction();

        // Tokens
        expect(flappa.applyTokenMappings).toBeFunction();
        expect(flappa.containsTokens).toBeFunction();
        expect(flappa.expandCompositeTokensInTemplate).toBeFunction();
        expect(flappa.expandTokens).toBeFunction();
        expect(flappa.expandTokensWithCaptures).toBeFunction();
        expect(flappa.getAvailableTokens).toBeFunction();
        expect(flappa.getTokenPattern).toBeFunction();
        expect(flappa.shouldDefaultToFuzzy).toBeFunction();
        expect(flappa.stripTokenMappings).toBeFunction();
        expect(flappa.TOKEN_PATTERNS).toBeObject();
        expect(flappa.Token).toBeObject();
        expect(flappa.templateToRegex).toBeFunction();
        expect(flappa.withCapture).toBeFunction();

        // Rules
        expect(flappa.PATTERN_TYPE_KEYS).toBeArray();

        // Utils
        expect(flappa.escapeRegex).toBeFunction();
        expect(flappa.escapeTemplateBrackets).toBeFunction();
        expect(flappa.makeDiacriticInsensitive).toBeFunction();

        // Validation
        expect(flappa.validateSegments).toBeFunction();
    });

    it('should have valid type definitions for all public interfaces', () => {
        // No-op assignments to verify types are exported and usable

        // Analysis
        const _commonPattern: CommonLineStartPattern = {} as any;
        const _lsOptions: LineStartAnalysisOptions = {} as any;
        const _lsExample: LineStartPatternExample = {} as any;
        const _rsExample: RepeatingSequenceExample = {} as any;
        const _rsOptions: RepeatingSequenceOptions = {} as any;
        const _rsPattern: RepeatingSequencePattern = {} as any;

        // Detection
        const _detected: DetectedPattern = {} as any;

        // Optimization
        const _optimizeRes: OptimizeResult = {} as any;

        // Recovery
        const _recReport: MarkerRecoveryReport = {} as any;
        const _recRun: MarkerRecoveryRun = {} as any;
        const _recSel: MarkerRecoverySelector = {} as any;

        // Segmentation & Rule Validation
        const _patProc: PatternProcessor = {} as any;
        const _ruleValRes: RuleValidationResult = {} as any;
        const _valIssue: ValidationIssue = {} as any;
        const _valType: ValidationIssueType = {} as any;

        const _segValIssue: SegmentValidationIssue = {} as any;
        const _segValSev: SegmentValidationIssueSeverity = {} as any;
        const _segValType: SegmentValidationIssueType = {} as any;
        const _segValRep: SegmentValidationReport = {} as any;
        const _valOpts: ValidationOptions = {} as any;

        const _expRes: ExpandResult = {} as any;
        const _tokKey: TokenKey = {} as any;
        const _tokMap: TokenMapping = {} as any;

        // Core
        const _bp: Breakpoint = {} as any;
        const _bpRule: BreakpointRule = {} as any;
        const _page: Page = {} as any;
        const _pageRange: PageRange = {} as any;
        const _prConstraint: PageRangeConstraint = {} as any;
        const _prExclude: PageRangeConstraintWithExclude = {} as any;
        const _segment: Segment = {} as any;

        // Options
        const _ceRule: CondenseEllipsisRule = {} as any;
        const _ftwRule: FixTrailingWawRule = {} as any;
        const _logger: Logger = {} as any;
        const _ppTransform: PreprocessTransform = {} as any;
        const _rzwRule: RemoveZeroWidthRule = {} as any;
        const _segOptions: SegmentationOptions = {} as any;

        // Rules
        const _ptKey: PatternTypeKey = {} as any;
        const _splitRule: SplitRule = {} as any;

        // Just to avoid unused var errors (though TS check handles this implicitly by compiling)
        expect([
            _commonPattern,
            _lsOptions,
            _lsExample,
            _rsExample,
            _rsOptions,
            _rsPattern,
            _detected,
            _optimizeRes,
            _recReport,
            _recRun,
            _recSel,
            _patProc,
            _ruleValRes,
            _valIssue,
            _valType,
            _segValIssue,
            _segValSev,
            _segValType,
            _segValRep,
            _valOpts,
            _expRes,
            _tokKey,
            _tokMap,
            _bp,
            _bpRule,
            _page,
            _pageRange,
            _prConstraint,
            _prExclude,
            _segment,
            _ceRule,
            _ftwRule,
            _logger,
            _ppTransform,
            _rzwRule,
            _segOptions,
            _ptKey,
            _splitRule,
        ]).toBeDefined();
    });
});
