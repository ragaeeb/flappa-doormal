# Multi-Agent TDD Design Review Template

Repeatable workflow: plan → multi-agent critique → synthesize → update → implement TDD-first.

---

## 0) Inputs (gather before starting)

| Field | Value |
|-------|-------|
| Feature name | |
| One-line goal | |
| API change? | yes/no; describe |
| Files involved | |
| Constraints | perf, BC, security, lint |
| Non-goals | |
| Example I/O | |

---

## 1) Plan Template (`docs/<feature>-plan.md`)

### Problem Statement
- What problem? What failure mode?
- Inputs → Outputs

### Project Context
- Relevant invariants and behaviors
- Key source files (paths)
- Known gotchas

### Proposed API
```typescript
// Public signatures, types, defaults
```

### Algorithm
- Pseudocode outline
- Note repo invariants (preprocessing, tokens, fuzzy, joiners, breakpoints)
- Thresholds, tie-break rules

### Failure Modes
| Mode | Behavior |
|------|----------|
| Invalid input | fail safely + report |
| Ambiguous match | best-effort / threshold |

### Assumptions
- Explicit list

### Security
- ReDoS risks, mitigations

### Performance
- Big-O, caching, thresholds

### TDD Plan
| # | Test Name | Setup | Expected |
|---|-----------|-------|----------|
| 1 | happy path | ... | ... |
| 2 | edge case | ... | ... |
| 3 | fail gracefully | ... | ... |

### Implementation Steps
1. Step → test → files

### Deliverables
- code, docs, API exports

---

## 1.5) Prepare Code Context for Reviewers

Before sending the critique prompt, generate a comprehensive code dump for reviewers to understand the library.

### Using code2prompt

```bash
# Install if needed: cargo install code2prompt

# Generate code context (adjust paths for your feature)
code2prompt . \
  --include "src/segmentation/**,src/types/**,src/utils/textUtils.ts,src/index.ts,AGENTS.md" \
  --exclude "**/*.test.ts" \
  > code.txt
```

### What to Include

| Category | Files | Why |
|----------|-------|-----|
| **Type definitions** | `src/types/**` | API contracts, interfaces, enums |
| **Core logic** | `src/segmentation/**` | Implementation details |
| **Utilities** | `src/utils/*.ts` | Helper functions used throughout |
| **Entry point** | `src/index.ts` | Public exports |
| **Context** | `AGENTS.md` | Architecture, invariants, lessons learned |

### What to Exclude

- `**/*.test.ts` - Tests add noise; reviewers focus on implementation
- `node_modules/`, `dist/` - Build artifacts
- Large data files - Unless directly relevant

### Attach to Review Request

Include the generated `code.txt` content **before** your feature plan so reviewers understand the codebase first.

---

## 2) Critique Prompt (send to each AI model)

**IMPORTANT**: Ask reviewers to include this header in their response:
```
# <Model Name> <Version> Review
Date: <YYYY-MM-DD>
```

### Prompt Template

```text
You are reviewing an implementation plan for a TypeScript library feature in "flappa-doormal" (Arabic text segmentation). Changes are TDD-first.

## Attachments
1. **Code context**: [Paste code.txt or attach file] - Review this first to understand the library
2. **Feature plan**: docs/<feature>-plan.md

## Library Context
- `segmentPages(pages, options)` segments Arabic text using declarative rules
- Bun test runner, Biome linting (max cognitive complexity 15)
- TypeScript strict mode

## Review Tasks

### 1. Correctness
- Does the proposed algorithm match repo behavior/invariants?
- Any logical errors in the pseudocode?
- Edge cases where the algorithm might fail?

### 2. Edge Cases (be thorough)
- Empty inputs, single-element arrays
- Unicode edge cases (surrogates, combining marks, RTL/LTR marks)
- Boundary conditions (position 0, end of content)
- Invalid/malformed inputs
- Interactions with existing features (tokens, fuzzy, page constraints)

### 3. Algorithm Improvements
- Better data structures?
- More efficient approaches?
- Threshold values and tie-break rules
- Should behavior be configurable?

### 4. API Design
- Is the proposed API intuitive?
- Required vs optional parameters?
- Default values - are they sensible?
- Error handling and validation
- Backward compatibility concerns
- Naming conventions (consistency with existing API)

### 5. Performance
- Big-O complexity analysis
- Memory usage concerns
- Caching opportunities
- Regex compilation overhead
- Large input scenarios (1000+ items)

### 6. Security
- ReDoS risks with user-provided patterns
- Input validation gaps
- Injection risks

### 7. Documentation
- Is the behavior clearly explained?
- Are edge cases documented?
- Any confusing aspects that need clarification?

### 8. Testing Gaps
- What tests would catch regressions?
- Real-world scenarios to validate
- Interactions with other features to test

## Repo Constraints
- Preprocessing parity (replacements applied before segmentation)
- Fuzzy defaults: `bab`, `basmalah`, `fasl`, `kitab`, `naql` auto-enable fuzzy
- Page joiner behavior: 'space' (default) or 'newline'
- Breakpoint order matters: first match wins
- Segments are always trimmed by `createSegment()`
- `maxContentLength` minimum is 50

## Response Format (REQUIRED)

1. **Header**: Start with `# <Your Model Name> <Version> Review` and `Date: YYYY-MM-DD`

2. **Top 10 Issues** (prioritized, most critical first):
   For each issue:
   - **Issue**: Clear description
   - **Severity**: Critical / High / Medium / Low
   - **Fix**: Specific recommendation (pseudo-code ok)

3. **Test Matrix Table** (18+ cases):

| # | Test Name | Input | Expected | Category |
|---|-----------|-------|----------|----------|
| 1 | ... | ... | ... | happy-path |
| 2 | ... | ... | ... | edge-case |
| 3 | ... | ... | ... | fail-gracefully |

Categories must include:
- At least 4 happy-path tests
- At least 4 edge-case tests
- At least 3 fail-gracefully tests
- At least 3 boundary/normalization tests
- At least 2 integration tests
- At least 2 performance-related tests (if applicable)

4. **API Design Recommendations**: Answer each API question specifically

5. **Security Assessment**: Specific risks and mitigations

6. **Revised Algorithm** (if recommending changes): Provide updated pseudo-code

7. **Missing Features**: Anything we should consider adding?

Keep response focused and actionable. Avoid excessive markdown formatting.
```

---

## 3) Review Collection

Save as: `docs/reviews/<model-name>-<feature>.md`

Example: `docs/reviews/claude-sonnet-4.5-breakpoint-dx.md`

### Expected Response Format

```markdown
# <Model Name> <Version> Review
Date: YYYY-MM-DD

## Top 10 Issues

1. **Issue**: Description
   **Severity**: Critical / High / Medium / Low
   **Fix**: Recommendation

2. ...

## Test Matrix

| # | Test Name | Input | Expected | Category |
|---|-----------|-------|----------|----------|
| 1 | ... | ... | ... | happy-path |
| 2 | ... | ... | ... | edge-case |
| 3 | ... | ... | ... | fail-gracefully |
| 4 | ... | ... | ... | boundary |
| ... | ... | ... | ... | ... |

## API Design Recommendations

- Field naming: ...
- Default values: ...
- Error handling: ...
- Backward compatibility: ...

## Security Assessment

- Risk 1: ...
- Mitigation: ...

## Revised Algorithm (if applicable)

```typescript
// Updated pseudo-code
```

## Missing Features / Future Considerations

- ...
```

### Checklist for Collecting Reviews

- [ ] Claude Sonnet 4.5 / Opus
- [ ] GPT-5 / GPT-4o
- [ ] Gemini Pro
- [ ] Grok
- [ ] Other models as available

Aim for 3-5 diverse reviewers to catch different perspectives.

---

## 4) Synthesis Template (`docs/<feature>-review-synthesis.md`)

```markdown
# <Feature> Review Synthesis

## Reviews Analyzed
| Model | Date | File |
|-------|------|------|

## Consensus (all/most agree)
| # | Item | Action |
|---|------|--------|

## Disagreements
| Issue | Position A | Position B | Decision | Rationale |
|-------|------------|------------|----------|-----------|

## Unique Points
### <Model A>
- Best contribution

### <Model B>
- Best contribution

## Action Items

### Must Fix (MVP)
| # | Item | Source | Status |
|---|------|--------|--------|

### Deferred
| # | Item | Reason |
|---|------|--------|

### Test Order (TDD)
| # | Test | Files |
|---|------|-------|

### Implementation Steps
| # | Step | Test | Files |
|---|------|------|-------|
```

---

## 4.1) Synthesizer Agent Responsibilities

### Inputs
- Original plan: `docs/<feature>-plan.md`
- Reviews: `docs/reviews/*.md`

### Outputs
1. Synthesis doc: `docs/<feature>-review-synthesis.md`
2. Updated plan: `docs/<feature>-plan-v2.md`
3. TDD checklist in updated plan

### Process
1. **Extract**: must-fix, algorithm changes, tests, perf/security notes
2. **Cluster**: correctness, API, heuristics, performance, security, tests
3. **Scope** (senior judgment):
   - MVP-required
   - Nice-to-have (cheap + high ROI)
   - Out of scope / overengineering
4. **Update plan**: API, algorithm, thresholds, failure modes
5. **Verify claims**: When reviewers flag "critical" issues, check the actual codebase before implementing. Some claims are based on incorrect assumptions.

---

## 4.2) Pre-Implementation: Prove Assumptions

Before implementing, write tests to verify any assumptions in the plan. This prevents wasted effort on features based on incorrect beliefs.

### Example: Proving Redundancy

If the plan claims "X is redundant because of Y":

```typescript
describe('X redundancy proof', () => {
    it('should produce identical results with and without X', () => {
        const withX = functionCall({ option: 'withX' });
        const withoutX = functionCall({ option: 'withoutX' });
        
        expect(withX).toEqual(withoutX);
    });
});
```

If tests pass → document in README and remove from implementation scope.
If tests fail → update plan with correct behavior.

### Common Assumptions to Verify

- "Trimming makes X unnecessary" → test both with/without
- "Default value covers this case" → test edge cases
- "These produce identical output" → test with varied inputs
- "This is never called with X" → add assertion or test

---

## 5) TDD Loop Checklist

For each step:
- [ ] Write failing test
- [ ] Implement minimum to pass
- [ ] Refactor (Biome complexity)
- [ ] Add diagnostics for ambiguous cases
- [ ] Update docs after tests pass

---

## 6) Defaults (this repo)

| Setting | Value |
|---------|-------|
| Prefer | Deterministic over heuristic |
| Heuristics | Require opt-in, strict thresholds, fail-safe |
| Max complexity | 15 |
| Max function lines | 50-80 |
| Approach | YAGNI - add complexity only when tests demand it |

---

## 7) Lessons Learned

### For Reviewers (what helps synthesis)
1. **Include model name + version + date** in header
2. **Use tables** for test matrices (easier to parse)
3. **Prioritize issues** (numbered list, most important first)
4. **Be specific**: pseudo-code > vague descriptions
5. **Avoid redundant markdown** (no excessive headers, blank lines)
6. **State assumptions explicitly** when making claims about codebase

### For Synthesizer
1. **Verify "critical" claims** against actual code before acting
2. **Disagreements are valuable** - they reveal edge cases
3. **Unique points per reviewer** often catch issues others miss
4. **Fast path / optimization code** is often misunderstood - verify interactions
5. **Test both sides of thresholds** (e.g., 999 vs 1000 pages)

### Common False Positives
- "Unicode safety needed" - often the user's pattern defines boundaries
- "Fast path doesn't handle X" - often the fast path doesn't apply to X
- "Breaking change" - often an edge case that was never officially supported

### Preparing Context for Reviewers
1. **Include type definitions** - Reviewers need to see interfaces and contracts
2. **Include AGENTS.md** - Contains invariants, gotchas, and lessons learned
3. **Exclude tests** - They add noise; reviewers should focus on implementation
4. **Prove assumptions first** - Write tests before asking reviewers to validate claims
5. **Ask specific questions** - Generic "review this" gets generic responses

### What to Ask Reviewers For
1. **Severity ratings** - Not all issues are equal; prioritization helps
2. **18+ test cases** - More tests = better coverage of edge cases
3. **Specific recommendations** - Pseudo-code > vague suggestions
4. **API design opinions** - Naming, defaults, error handling
5. **Security assessment** - ReDoS, injection, validation gaps
6. **Performance analysis** - Big-O, memory, large input scenarios

### Review Prompt Anti-patterns
- "Please review this code" - Too vague
- Not including type definitions - Reviewers can't understand API
- Asking for "tests" without categories - Get random tests instead of systematic coverage
- Not specifying response format - Hard to synthesize inconsistent responses
