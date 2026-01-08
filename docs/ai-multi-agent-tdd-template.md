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

## 2) Critique Prompt (send to each AI model)

**IMPORTANT**: Ask reviewers to include this header in their response:
```
# <Model Name> <Version> Review
Date: <YYYY-MM-DD>
```

### Prompt Template

```text
You are reviewing an implementation plan for a TypeScript library feature in "flappa-doormal" (Arabic text segmentation). Changes are TDD-first.

Given:
- Feature plan: docs/<feature>-plan.md
- Relevant source files (paths in plan)

Context:
- segmentPages(pages, options) segments Arabic text using declarative rules
- Bun tests, Biome linting (max complexity 15)

Tasks:
1. Correctness: Does the plan match repo behavior/invariants?
2. Edge cases: Missing scenarios, ambiguous behavior?
3. Algorithm: Improvements (data structures, thresholds, tie-breaks)?
4. Tests: Propose 12+ specific test cases with inputs/expected outputs
5. API: Required vs optional, validation, error reporting?
6. Performance: Big-O, caching recommendations?
7. Security: ReDoS, untrusted config risks?

Repo constraints:
- <list here: preprocessing parity, fuzzy defaults, joiner behavior, etc.>

Response format (REQUIRED):
1. Start with: `# <Your Model Name> <Version> Review` and `Date: YYYY-MM-DD`
2. Top 10 issues (prioritized, actionable)
3. For each: specific recommendation (pseudo-code ok)
4. Test matrix table (12+ cases):
   | # | Test | Input | Expected | Category |
   |---|------|-------|----------|----------|
   Include: 3 fail-gracefully, 3 edge-cases, 3 boundary/normalization
5. Revised plan outline (if restructuring helps)

Keep response concise. Avoid excessive markdown formatting. Focus on actionable items.
```

---

## 3) Review Collection

Save as: `docs/reviews/<model-name>.md`

Expected format:
```markdown
# <Model Name> <Version> Review
Date: YYYY-MM-DD

## Top 10 Issues
1. **Issue**: Description
   **Fix**: Recommendation

## Test Matrix
| # | Test | Input | Expected | Category |
|---|------|-------|----------|----------|

## Revised Plan Outline (optional)
```

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
