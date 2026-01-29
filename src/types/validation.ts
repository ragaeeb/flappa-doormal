export type ValidationIssueSeverity = 'error' | 'warn';

export type ValidationIssueType =
    | 'max_pages_violation'
    | 'page_attribution_mismatch'
    | 'content_not_found'
    | 'page_not_found';

export type ValidationIssue = {
    type: ValidationIssueType;
    severity: ValidationIssueSeverity;
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

export type ValidationReport = {
    ok: boolean;
    summary: {
        segmentCount: number;
        pageCount: number;
        issues: number;
        errors: number;
        warnings: number;
    };
    issues: ValidationIssue[];
};
