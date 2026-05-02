// Analysis module barrel export

export type {
    CommonLineStartPattern,
    LineStartAnalysisOptions,
    LineStartPatternExample,
} from './line-starts.js';
export { analyzeCommonLineStarts } from './line-starts.js';

export type {
    RepeatingSequenceExample,
    RepeatingSequenceOptions,
    RepeatingSequencePattern,
    TokenStreamItem,
} from './repeating-sequences.js';
export { analyzeRepeatingSequences, tokenizeContent } from './repeating-sequences.js';

export type {
    BreakpointSuggestion,
    PreprocessDetections,
    PreprocessSuggestion,
    RuleSuggestionConfidence,
    RuleSuggestionSource,
    SegmentationAdvisorMode,
    SegmentationAdvisorOptions,
    SegmentationEvaluation,
    SegmentationSuggestionReport,
    SuggestedRule,
} from './segmentation-advisor.js';
export { suggestSegmentationOptions } from './segmentation-advisor.js';
