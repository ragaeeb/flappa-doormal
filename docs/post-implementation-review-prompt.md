# Post-Implementation Review Prompt Template

Use this template when requesting AI agents to review completed implementations.

## Before Sending the Review

1. **Generate the diff**:
   ```bash
   git diff main > review-diff.txt
   ```

2. **Include relevant context**:
   - The diff file
   - Original plan document
   - Any specific areas of concern

## Prompt Template

Copy and customize this prompt for your review:

---

You are reviewing a completed implementation for the "flappa-doormal" TypeScript library (Arabic text segmentation).

## Implementation Summary

[Describe what was implemented - 2-3 sentences]

## Attachments

1. **Git diff**: [Paste diff or attach file]
2. **Original plan**: docs/feature/<feature>/<feature>-plan.md

## Library Context

- `segmentPages(pages, options)` segments Arabic text using declarative rules
- Bun test runner, Biome linting (max cognitive complexity 15)
- TypeScript strict mode
- Existing test suite: 642+ tests

## Review Focus Areas

### 1. Correctness
- Does the implementation match the plan specifications?
- Are edge cases handled correctly (empty arrays, invalid inputs)?
- Any off-by-one errors or boundary issues?

### 2. Performance
- Any O(n²) algorithms or unnecessary allocations?
- Impact on large inputs (1000+ pages)?
- Regex compilation overhead?
- String allocation patterns?

### 3. Code Quality
- Any code duplication that should be extracted?
- Functions under Biome's complexity limit (15)?
- Consistent naming conventions?
- JSDoc comments adequate?

### 4. Overengineering
- Any unnecessary abstractions added?
- Features that could be simpler?
- Type definitions too complex?

### 5. Maintainability
- Easy to extend in the future?
- Clear separation of concerns?
- Test coverage sufficient?

### 6. Security
- Any ReDoS risks introduced?
- Input validation adequate?

### 7. API Design
- Is the API intuitive?
- Are defaults sensible?
- Backward compatibility maintained?

### 8. Missing Tests
- What edge cases aren't covered?
- Any integration scenarios missing?
- Unicode edge cases for Arabic text?

## Response Format

1. **Header**: `# <Model Name> <Version> Post-Implementation Review`

2. **Issues Found** (prioritized, most critical first):
   For each issue:
   - **Issue**: Clear description
   - **Severity**: Critical / High / Medium / Low
   - **Location**: File and line numbers
   - **Fix**: Specific recommendation

3. **Missing Tests** (table):

   | # | Test Name | Why Needed |
   |---|-----------|------------|


4. **Performance Concerns** (if any)

5. **Code Quality Suggestions**

6. **Verdict**: Ready to merge / Needs changes / Major rework needed

Keep response focused and actionable.

---

## After Receiving Reviews

1. **Triage by severity**: Critical/High issues must be fixed before merge
2. **Verify claims**: Check actual code before implementing fixes
3. **Cross-reference**: If multiple reviewers flag the same issue, prioritize it
4. **Document lessons learned**: Update AGENTS.md with new insights

### Common Review Patterns

**Issues often flagged correctly:**
- Double-escaping in layered processing pipelines
- Empty array semantics (no-op vs fallback vs error)
- Performance: O(n²) string concatenation in loops
- Missing exhaustive switch handling for union types

**Issues often flagged incorrectly:**
- "Missing feature X" when X was intentionally deferred
- Incorrect assumptions about fast path behavior
- Over-engineering suggestions that add complexity without benefit

### Creating a Synthesis Document

After collecting reviews, create `docs/feature/<feature>/review-synthesis.md`:

1. **Consensus table**: Issues flagged by 3+ reviewers
2. **Disagreements table**: Conflicting positions + your decision + rationale
3. **Action items**: Must Fix (blocking) vs Should Fix vs Deferred vs Won't Fix
4. **Verdicts summary**: Quick tally of "ready to merge" vs "needs changes"
