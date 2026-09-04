---
name: pr-writing
description: Standard for authoring pull requests. Defines the canonical PR body template used for every PR and Conventional Commits as the standard for commit messages and PR titles.
---

# PR Writing

Author pull requests for a completed, reviewed change. Produce a semantic title, a body that follows the canonical template exactly, and open the PR only when the invoking workflow asks for it.

## Inputs

- Base branch and head branch
- Commit range and complete diff for the change
- Proposal, specs, design, and tasks (the OpenSpec intent)
- Validation results and the reviewer verdict (expected `APPROVE`)

Stop and request the missing context if the head branch, diff, or OpenSpec intent is unavailable.

## Conventional Commits standard

Every commit message and every PR title MUST follow [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<optional scope>): <description>
```

- Allowed `type`: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `build`, `ci`, `perf`, `style`, `revert`.
- `description` is imperative mood, lower-case, no trailing period, and fits within roughly 70 characters.
- A breaking change appends `!` after the type/scope (`feat(api)!: ...`) and is described under a `BREAKING CHANGE:` footer.
- The PR title reuses the type of the change's primary commit and summarises the whole change.

When commits on the branch do not follow this standard, surface that to the user rather than rewriting history silently.

## PR body template

The canonical body lives in `TEMPLATE.md` alongside this skill. Fill every section of that template exactly. Omit a section only when it genuinely does not apply, and say why in one line rather than leaving it blank.

## Behaviour

- Draft the title and body from evidence in the diff and OpenSpec artifacts. Do not invent changes, tests, or results.
- Present the draft to the user for confirmation before opening the PR.
- Open the PR only when explicitly asked. Never merge, force-push, or rewrite published history.
- Keep the body free of explanatory noise; every section must earn its place.
