---
name: code-review
description: Independently review a complete change after implementation and validation. Read-only; returns structured local findings and a verdict.
---

# Code Review

Review the complete committed change against its proposal, specs, design, tasks, repository conventions, and tests.

## Inputs

- Base branch and reviewed commit SHA
- Complete diff and changed files
- Proposal, specs, design, and tasks
- Relevant repository guidance and validation results

Stop if the reviewed commit or required context is missing.

## Read-only behaviour

Do not edit files, commit, push, merge, or post feedback externally. Return local feedback only.

## Rubric

Check:

- Correctness and requirement coverage
- Regressions and edge cases
- Test adequacy through observable seams
- Security and unsafe input handling
- Maintainability and repository conventions
- Unnecessary complexity or scope

Read every changed file in full and inspect surrounding code where needed. Do not invent findings.

## Structured output

Classify every finding as:

- `BLOCKING` — must be fixed before completion
- `WARNING` — important but does not block completion
- `NIT` — optional style or polish

Return:

```text
Verdict: APPROVE | REQUEST_CHANGES
Reviewed Commit SHA: <sha>
Findings:
- Severity: BLOCKING | WARNING | NIT
  Location: <file:line>
  Issue: <concise explanation>
  Required Action: <specific correction>
Summary: <one paragraph>
```

Use `REQUEST_CHANGES` when any `BLOCKING` finding exists. Otherwise use `APPROVE`; warnings and nits do not block approval.
