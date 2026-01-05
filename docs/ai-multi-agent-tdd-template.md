## Multi-agent TDD design review template (copy/paste)

This repo uses a repeatable workflow:
- write an implementation plan
- get several AI agents to critique it using a **strict prompt + response structure**
- synthesize the feedback (agreement/differences/unique points + senior-engineer scope judgment)
- update the plan
- implement **TDD-first**

This document is a reusable template for that workflow.

---

## 0) Inputs you should gather before starting

Fill these in (keep them short and concrete):

- **Feature name**:
- **One-line goal**:
- **User-facing API change?** (yes/no; describe)
- **Files likely involved** (guesses are ok):
- **Constraints**:
  - performance/memory:
  - backwards compatibility:
  - security:
  - lint/complexity constraints (Biome):
- **Non-goals**:
- **Example input/output** (small, representative):

---

## 1) Implementation plan template (markdown)

Create a plan doc in `docs/`:
- `docs/<feature>-plan.md`

Use this structure (copy/paste and fill in):

### Problem statement
- What problem are we solving?
- What’s the exact failure mode / desired behavior?
- What inputs do we have and what outputs do we need?

### Project context (repo-specific)
- Summarize relevant library behaviors and invariants that must be preserved.
- Link the most relevant source files (paths).
- Include any known gotchas from prior work.

### Proposed API (public + internal)
- Public function signatures (TypeScript).
- Types/interfaces.
- Configuration options and defaults.
- Validation behavior and error reporting.

### Algorithm (step-by-step)
- Outline the core algorithm with pseudocode.
- Call out where repo invariants matter (e.g., preprocessing parity, token expansion, fuzzy defaults, joiner behavior, breakpoints, etc.).
- Specify matching/alignment/selection logic precisely (thresholds, tie-break rules).

### Caveats / pitfalls / failure modes
- List realistic failure modes and how we handle them.
- Explicitly distinguish:
  - “fail safely and report unresolved”
  - “hard error”
  - “best-effort”

### Assumptions
- Make assumptions explicit (inputs were produced by same options, ordering preserved, etc.).

### Security considerations
- ReDoS / untrusted pattern risks
- resource limits / timeouts / safeguards

### Performance considerations
- Big-O and where it matters in practice for this repo
- caching opportunities
- thresholds for switching strategies

### TDD plan (tests first)
- List the next tests we will write, in order, with:
  - test name
  - setup (pages/options/etc.)
  - expected result
- Include at least:
  - happy-path
  - edge-case
  - “fail gracefully”
  - regression test(s)

### Implementation steps (incremental)
- Ordered list of changes, each small enough to validate with tests.
- Mention files to modify/add.
- Call out when to refactor to satisfy Biome complexity constraints.

### Deliverables
- code artifacts
- docs updates
- exported API changes

---

## 2) Critique prompt template (plain text for other AI agents)

Copy/paste the prompt below, fill placeholders, then send to each AI agent/model.

```text
You are reviewing an implementation plan for a TypeScript library feature in the repo “flappa-doormal”.
This repo is a declarative Arabic text segmentation library. We implement changes TDD-first.

You are given:
- Feature plan doc: docs/<feature>-plan.md
- Relevant repo files (mentioned in the plan)

Context you must assume:
- segmentPages(pages, options) segments Arabic text pages using declarative rules.
- The codebase uses Bun tests and Biome linting (low function complexity is enforced).

Your tasks:
1) Critique the plan for correctness against the repo’s behavior and invariants.
2) Identify missing edge cases, ambiguous scenarios, and failure modes.
3) Propose concrete algorithm improvements (data structures, scoring functions, thresholds, tie-break rules).
4) Propose a TDD test matrix: specific tests (inputs/expected outputs) that catch subtle bugs.
5) Call out API design issues: required vs optional inputs, validation, report schema, and how to avoid accidental behavior changes.
6) Analyze performance: Big-O + practical costs; recommend caching and thresholds.
7) Security: regex/ReDoS/untrusted config concerns; mitigations or documentation requirements.

Important repo-specific constraints to keep in mind:
- <list repo-specific constraints here, e.g. preprocessing parity, fuzzy defaults, breakpoints, joiner semantics, etc.>

Please respond with:
- A bullet list of the top 10 most important issues/improvements (prioritized).
- For each, a specific recommendation with enough detail to implement (pseudo-code welcome).
- A proposed revised outline for the plan doc (section headings) if restructuring would help.
- A table of at least 12 concrete test cases (brief but specific), including:
  - at least 3 “should fail gracefully” cases
  - at least 3 “edge cases” specific to this repo
  - at least 3 cases involving post-processing/normalization/boundary behavior (if relevant)
```

---

## 3) Review collection template

Create one file per model in `docs/`:
- `docs/<model>-<feature>-review.md`

Ask reviewers to keep their response in the structure required by the prompt above.

---

## 4) Synthesis template (markdown)

Create:
- `docs/<feature>-review-synthesis.md`

Structure:

### Files Reviewed
- List each review doc path.

### Collective Agreement
- Bullet points of the shared conclusions.
- Include why they matter for correctness.

### Key Disagreements
- Use a table to capture conflicting feedback:

| Issue | Position A | Position B | My Decision |
|-------|------------|------------|-------------|
| *Topic* | *One view (e.g. "Bug")* | *Opposing view (e.g. "Feature")* | *Your judge call* |

### Unique Points Per Reviewer
- One small subsection per reviewer with their best unique contribution.

### Verdict (What We Will Do Next)

#### MVP Scope (Must Fix)
- List critical bugs and essential features.
- Explicitly link to who suggested it (e.g., "Proposed by Claude").

#### Deferred / Out-of-Scope
- List features that are nice-to-have but not critical.
- Explain *why* (e.g., "Overengineering", "Premature optimization").

#### Concrete Next Tests (TDD Order)
- List the exact next tests to implement, in priority order:
  1. Small deterministic checks / Invariants
  2. Edge cases (empty inputs, boundaries)
  3. Heuristics / Complex logic

#### Implementation Steps (Mapped to Tests)
- Map each test to the files/functions that need changing.

---

## 4.1) Final synthesizer agent: responsibilities + next steps

This is the “last agent” step after reviews are collected. The goal is to turn critiques into a **decision record** and a **TDD-ready execution plan**.

### Inputs
- The original plan doc: `docs/<feature>-plan.md`
- All review docs: `docs/<model>-<feature>-review.md`
- Any repo constraints discovered during review (lint rules, performance limits, invariants)

### Outputs (artifacts to produce)
1) **Synthesis doc**: `docs/<feature>-review-synthesis.md`
2) **Updated plan doc**: `docs/<feature>-plan-v2.md` (or overwrite the original if you prefer)
3) **TDD next-steps checklist** inside the updated plan (tests in exact order)

### How to synthesize (recommended process)
- **Step A — Extract claims**:
  - For each review, extract:
    - must-fix correctness issues
    - suggested algorithm/API changes
    - new test cases
    - performance/security notes
- **Step B — Cluster feedback**:
  - Group claims into buckets:
    - correctness/invariants
    - API design
    - alignment/matching heuristics + thresholds
    - performance/caching
    - security
    - reporting/diagnostics
    - tests
- **Step C — Decide scope (senior engineer judgment)**:
  - For each bucket, decide:
    - **MVP-required** (must implement now)
    - **nice-to-have** (only if cheap + high ROI)
    - **out of scope** (belongs to clients or a separate tool)
  - Explicitly call out **overengineering** candidates:
    - heavy dependencies
    - complex inference without reliable inputs
    - algorithms that are hard to validate with tests
- **Step D — Update the plan**:
  - Update API + algorithm + report schema in the plan.
  - Add/adjust assumptions and failure modes.
  - Add hard thresholds and “fail safe” behavior where needed.

### How to translate synthesis into TDD execution
- **Step 1 — Rewrite the TDD test order**:
  - Start with the smallest deterministic behavior (baseline failing test).
  - Add tests that lock in invariants and prevent regressions.
  - Add edge cases and “fail gracefully” tests next.
  - Only then add heuristics/best-effort behaviors.
- **Step 2 — Create an implementation sequence aligned to tests**:
  - Each step should be “add test → implement → refactor to satisfy Biome complexity”.
  - Prefer extracting helpers early to keep functions under complexity limits.
- **Step 3 — Define exit criteria**:
  - All new tests pass.
  - No new lints.
  - Public API is documented (README/AGENTS as appropriate).
  - Report/diagnostics are sufficient for users to trust results.



## 5) “TDD-first” implementation loop checklist

For each incremental step:
- Write a failing test first.
- Implement the minimum code to pass.
- Refactor to satisfy Biome complexity constraints (extract helpers early).
- Add report/diagnostics for ambiguous/unresolved cases (don’t guess silently).
- Update docs only after behavior is validated by tests.

---

## 6) Suggested defaults (works well for this repo)

- **Prefer deterministic approaches** over heuristic ones.
- **When heuristics are necessary**:
  - require explicit opt-in (e.g. `fuzzy: true`)
  - define strict thresholds (e.g. "max 2000 chars deviation")
  - fail safe (return unresolved) instead of guessing silently
- **Keep algorithms simple** unless tests demonstrate a need for more complexity (YAGNI).
- **Complexity limits**: 
  - Max cyclomatic complexity: 15
  - Max function length: ~50-80 lines (extract helpers early)


