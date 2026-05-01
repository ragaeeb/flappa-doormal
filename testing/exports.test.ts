import { describe, expect, it } from 'bun:test';
// Import Types to verify they are exported correctly
import type {
    // Core Types
    ArabicDictionaryEntryRuleOptions,
    ArabicDictionaryProfile,
    Breakpoint,
    BreakpointRule,
    // Analysis
    CommonLineStartPattern,
    // Options
    CondenseEllipsisRule,
    // Detection
    DetectedPattern,
    DictionaryBlocker,
    DictionaryDiagnosticReason,
    DictionaryDiagnosticSample,
    DictionaryEntryPatternOptions,
    DictionaryFamily,
    DictionaryFamilyUse,
    DictionaryGate,
    DictionaryHeadingClass,
    DictionaryHeadingScanClass,
    DictionaryMarkdownPage,
    DictionaryProfileDiagnostics,
    DictionaryProfileDiagnosticsOptions,
    DictionaryProfileValidationIssue,
    DictionaryProfileValidationIssueCode,
    DictionarySegmentKind,
    DictionarySegmentMeta,
    DictionarySurfaceKind,
    DictionarySurfaceMatch,
    DictionarySurfaceReport,
    DictionaryZone,
    // Segmenter
    ExpandResult,
    FixTrailingWawRule,
    LineStartAnalysisOptions,
    LineStartPatternExample,
    Logger,
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
    TokenPatternName,
    ValidationIssue,
    ValidationIssueType,
    ValidationOptions,
} from '../dist/index.mjs';
import * as flappa from '../dist/index.mjs';

const typedEmpty = <T>() => ({}) as unknown as T;

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

        // Breakpoint Utils
        expect(flappa.escapeWordsOutsideTokens).toBeFunction();
        expect(flappa.createArabicDictionaryEntryRule).toBeFunction();
        expect(flappa.classifyDictionaryHeading).toBeFunction();
        expect(flappa.diagnoseDictionaryProfile).toBeFunction();
        expect(flappa.DictionaryProfileValidationError).toBeFunction();
        expect(flappa.validateDictionaryProfile).toBeFunction();
        expect(flappa.scanDictionaryMarkdownPage).toBeFunction();
        expect(flappa.analyzeDictionaryMarkdownPages).toBeFunction();

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
        expect(flappa.PATTERN_TYPE_KEYS).toContain('dictionaryEntry');

        // Utils
        expect(flappa.escapeRegex).toBeFunction();
        expect(flappa.escapeTemplateBrackets).toBeFunction();
        expect(flappa.getDebugReason).toBeFunction();
        expect(flappa.getSegmentDebugReason).toBeFunction();
        expect(flappa.makeDiacriticInsensitive).toBeFunction();

        // Validation
        expect(flappa.validateSegments).toBeFunction();
    });

    it('should have valid type definitions for all public interfaces', () => {
        // No-op assignments to verify types are exported and usable

        // Analysis
        const _commonPattern: CommonLineStartPattern = typedEmpty();
        const _dictionaryProfile: ArabicDictionaryProfile = typedEmpty();
        const _arabicDictionaryRuleOptions: ArabicDictionaryEntryRuleOptions = typedEmpty();
        const _lsOptions: LineStartAnalysisOptions = typedEmpty();
        const _lsExample: LineStartPatternExample = typedEmpty();
        const _rsExample: RepeatingSequenceExample = typedEmpty();
        const _rsOptions: RepeatingSequenceOptions = typedEmpty();
        const _rsPattern: RepeatingSequencePattern = typedEmpty();

        // Detection
        const _detected: DetectedPattern = typedEmpty();
        const _dictionaryBlocker: DictionaryBlocker = typedEmpty();
        const _dictionaryDiagnosticReason: DictionaryDiagnosticReason = typedEmpty();
        const _dictionaryDiagnosticSample: DictionaryDiagnosticSample = typedEmpty();
        const _dictionaryFamily: DictionaryFamily = typedEmpty();
        const _dictionaryFamilyUse: DictionaryFamilyUse = typedEmpty();
        const _dictionaryGate: DictionaryGate = typedEmpty();
        const _dictionaryHeadingClass: DictionaryHeadingClass = typedEmpty();
        const _dictionaryHeadingScanClass: DictionaryHeadingScanClass = typedEmpty();
        const _dictionaryMarkdownPage: DictionaryMarkdownPage = typedEmpty();
        const _dictionaryProfileDiagnostics: DictionaryProfileDiagnostics = typedEmpty();
        const _dictionaryProfileDiagnosticsOptions: DictionaryProfileDiagnosticsOptions = typedEmpty();
        const _dictionaryProfileValidationIssue: DictionaryProfileValidationIssue = typedEmpty();
        const _dictionaryProfileValidationIssueCode: DictionaryProfileValidationIssueCode = typedEmpty();
        const _dictionarySegmentMeta: DictionarySegmentMeta = typedEmpty();
        const _dictionarySegmentKind: DictionarySegmentKind = typedEmpty();
        const _dictionarySurfaceKind: DictionarySurfaceKind = typedEmpty();
        const _dictionarySurfaceMatch: DictionarySurfaceMatch = typedEmpty();
        const _dictionarySurfaceReport: DictionarySurfaceReport = typedEmpty();
        const _dictionaryZone: DictionaryZone = typedEmpty();

        // Optimization
        const _optimizeRes: OptimizeResult = typedEmpty();

        // Segmentation & Rule Validation
        const _patProc: PatternProcessor = typedEmpty();
        const _ruleValRes: RuleValidationResult = typedEmpty();
        const _valIssue: ValidationIssue = typedEmpty();
        const _valType: ValidationIssueType = typedEmpty();

        const _segValIssue: SegmentValidationIssue = typedEmpty();
        const _segValSev: SegmentValidationIssueSeverity = typedEmpty();
        const _segValType: SegmentValidationIssueType = typedEmpty();
        const _segValRep: SegmentValidationReport = typedEmpty();
        const _valOpts: ValidationOptions = typedEmpty();

        const _expRes: ExpandResult = typedEmpty();
        const _tokKey: TokenKey = typedEmpty();
        const _tokMap: TokenMapping = typedEmpty();
        const _tokPatternName: TokenPatternName = typedEmpty();

        // Core
        const _bp: Breakpoint = typedEmpty();
        const _bpRule: BreakpointRule = typedEmpty();
        const _page: Page = typedEmpty();
        const _pageRange: PageRange = typedEmpty();
        const _prConstraint: PageRangeConstraint = typedEmpty();
        const _prExclude: PageRangeConstraintWithExclude = typedEmpty();
        const _segment: Segment = typedEmpty();

        // Options
        const _ceRule: CondenseEllipsisRule = typedEmpty();
        const _dictionaryEntryPatternOptions: DictionaryEntryPatternOptions = typedEmpty();
        const _ftwRule: FixTrailingWawRule = typedEmpty();
        const _logger: Logger = typedEmpty();
        const _ppTransform: PreprocessTransform = typedEmpty();
        const _rzwRule: RemoveZeroWidthRule = typedEmpty();
        const _segOptions: SegmentationOptions = typedEmpty();

        // Rules
        const _ptKey: PatternTypeKey = typedEmpty();
        const _splitRule: SplitRule = typedEmpty();

        // Just to avoid unused var errors (though TS check handles this implicitly by compiling)
        expect([
            _commonPattern,
            _dictionaryProfile,
            _arabicDictionaryRuleOptions,
            _lsOptions,
            _lsExample,
            _rsExample,
            _rsOptions,
            _rsPattern,
            _detected,
            _dictionaryBlocker,
            _dictionaryDiagnosticReason,
            _dictionaryDiagnosticSample,
            _dictionaryFamily,
            _dictionaryFamilyUse,
            _dictionaryGate,
            _dictionaryHeadingClass,
            _dictionaryHeadingScanClass,
            _dictionaryMarkdownPage,
            _dictionaryProfileDiagnostics,
            _dictionaryProfileDiagnosticsOptions,
            _dictionaryProfileValidationIssue,
            _dictionaryProfileValidationIssueCode,
            _dictionarySegmentMeta,
            _dictionarySegmentKind,
            _dictionarySurfaceKind,
            _dictionarySurfaceMatch,
            _dictionarySurfaceReport,
            _dictionaryZone,
            _optimizeRes,
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
            _tokPatternName,
            _bp,
            _bpRule,
            _page,
            _pageRange,
            _prConstraint,
            _prExclude,
            _segment,
            _ceRule,
            _dictionaryEntryPatternOptions,
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
