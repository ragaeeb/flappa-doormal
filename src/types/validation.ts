export type SegmentValidationIssueSeverity = 'error' | 'warn';

export type SegmentValidationIssueType =
    | 'max_pages_violation'
    | 'page_attribution_mismatch'
    | 'content_not_found'
    | 'page_not_found';

export type SegmentValidationIssue = {
    type: SegmentValidationIssueType;
    severity: SegmentValidationIssueSeverity;
    segmentIndex: number;
    segment: {
        from: number;
        to?: number;
        contentPreview: string;
    };
    expected?: {
        from?: number;
        to?: number;
    };
    actual?: {
        from?: number;
        to?: number;
    };
    pageContext?: {
        pageId: number;
        pagePreview: string;
        matchIndex?: number;
    };
    evidence?: string;
    hint?: string;
};

export type SegmentValidationReport = {
    ok: boolean;
    summary: {
        segmentCount: number;
        pageCount: number;
        issues: number;
        errors: number;
        warnings: number;
    };
    issues: SegmentValidationIssue[];
};
