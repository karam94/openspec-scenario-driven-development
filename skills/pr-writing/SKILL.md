---
name: pr-writing
description: Authors pull requests from a canonical body template, and applies Conventional Commits to every commit message and PR title. Always use when opening or updating a pull request, writing a PR description or title, or writing a commit message.
---

# PR Writing

Author a pull request for a completed, reviewed change: a semantic title, a body that follows the canonical template exactly, and the PR opened only when the invoking workflow asks for it.

## Inputs

- Base branch and head branch
- Commit range and complete diff
- Proposal, specs, design, and tasks — the OpenSpec intent
- Validation results and the reviewer verdict, expected `APPROVE`

Stop and request the missing context if the head branch, diff, or OpenSpec intent is unavailable.

## Conventional Commits standard

Every commit message and every PR title MUST follow [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>: <description>
```

- Allowed `type`: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `build`, `ci`, `perf`, `style`, `revert`.
- `description` is imperative mood, lower-case, no trailing period, within roughly 70 characters.
- A breaking change appends `!` after the type/scope (`feat(api)!: ...`) and is described under a `BREAKING CHANGE:` footer.
- The PR title reuses the type of the change's primary commit and summarises the whole change.

When commits on the branch do not follow this standard, surface that to the user rather than rewriting history silently.

## PR body

Fill [TEMPLATE.md](TEMPLATE.md) exactly. Its sections, in order: 🎯 Summary, ❓ Why, 🛠 Changes, 💥 Breaking Changes, 👀 Suggested Reviewer Focus, 🧪 Testing (acceptance criteria, test suites, failed to test), 🚀 Deployment / Operational Impact. Omit a section only when it genuinely does not apply, and say why in one line rather than leaving it blank.

## Behaviour

- Draft the title and body from evidence in the diff and the OpenSpec artifacts. Do not invent changes, tests, or results.
- Present the draft to the user for confirmation before opening the PR.
- Open the PR only when explicitly asked. Never merge, force-push, or rewrite published history.
- Keep the body free of explanatory noise; every section must earn its place.
