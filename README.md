# Scenario Driven Development 
**A custom schema for [OpenSpec](https://openspec.dev/).**

A mutation of the default OpenSpec workflow that combines **Spec-Driven Development**, **Vertical Slicing (Tracer Bullets)**, and **Acceptance Test-Driven Development (Double-Loop TDD)** into a single iterative delivery model.

Specifications are refined through small, end-to-end increments that provide fast feedback and continuous validation — enabling pragmatic and sustainable AI-assisted software engineering while avoiding the pitfalls of a waterfall approach.

## Install

TODO

## Why?

AI coding agents have made Specification-Driven Development mainstream & for good reason. Giving an agent a clear specification is far better than relying on vague prompts.

The problem is that many popular workflows quickly drift into Big Design Up Front - an anti-pattern that software engineering has spent decades moving away from. 

These workflows gained popularity because they give the illusion of higher productivity & output from the AI agent, requiring less human-input & shorter cycle times to produce what looks like working software. This works temporarily where speed is favoured over quality, perfect for prototyping. However in the long run, this eventually produces churn, increases technical debt & ironically demands more human-input because extension of the system becomes increasingly difficult.

Huge specifications, exhaustive task lists & code-level implementation checklists are created before a single line of working software exists. They are based on speculation rather than validated feedback from the real codebase. As scope grows, both humans & AI agents alike become overloaded with cognitive complexity, feedback arrives too late & design decisions become increasingly speculative. Tokens are also wasted up front on tasks that seem correct before implementation, only to be revised once the codebase provides real feedback. 

Scenario-Driven Development takes a different approach.

**Codebases provide feedback. Markdown documents don't.** 

**Planning creates hypotheses. Implementation creates knowledge.**

Until implementation begins - whether by a human or an AI agent - design is largely hypothesis. It is only through interacting with the real codebase & its automated tests that good, validated design can emerge. The moment implementation begins, assumptions are challenged, designs evolve & previously "complete" implementation plans become outdated. We want our confidence to come from working, tested software & not comprehensive markdown documents. The fastest way to discover the right design is through small, validated iterations in the real codebase & not by writing increasingly detailed plans about code that doesn't yet exist.

Instead of trying to design & implement an entire system or feature in one go, Scenario-Driven Development grows software one behaviour scenario at a time. Each scenario is specified, implemented, validated through an acceptance test, reviewed & then used to inform the next.

Scenario-Driven Development does **not** reject Specification-Driven Development. It simply changes where your tokens are spent, where planning stops & implementation begins to produce better software. It embraces just enough design up front to understand requirements & make significant architectural decisions where the cost of change is high & risky. Beyond that point, the fastest way to discover good design is through iterative implementation & continuous feedback.

The result is a workflow that embraces the strengths of AI while remaining grounded in proven software engineering principles: small iterations, rapid feedback from trusted automated tests & design that emerges from working software rather than upfront planning.

## What is a Scenario & how does it differ from a Requirement?

A Scenario in Scenario-Driven Development describes a single observable system behaviour using the familiar GIVEN/WHEN/THEN format. It defines an acceptance test case that can be verified end-to-end through an external testing seam. Every scenario must be independently deliverable, delivering a vertical slice across the entire system.

A Scenario does not exist in isolation. It belongs to an overarching Requirement, which describes a capability in natural language & provides the wider context needed to understand a system capability as a whole. Whilst the requirement defines the behavioural contract, one or more Scenarios provide concrete examples that prove the system adheres to the Requirement.

This follows the principles of Specification by Example. The Requirement describes the behaviour. The Scenarios provide concrete examples of that behaviour. A single Requirement will often contain multiple Scenarios covering the expected behaviour of the capability.

### Why not just define Scenarios in isolation & have the agent work through them?

Software requirements are often broader & more nuanced than a single GIVEN/WHEN/THEN. Some requirements are inherently broad enough to require multiple observable behaviours, whilst others begin as vague ideas that become clearer through refinement. A requirement typically describes capability through multiple scenarios, each demonstrating a different observable behaviour. For example, a single requirement may contain a happy path scenario, a sad path scenario & several edge case scenarios.

Separating Requirements from Scenarios keeps iterations small whilst preserving the bigger picture. The Requirement communicates the capability as a whole, whilst each Scenario provides a single, independently deliverable behaviour that contributes towards satisfying that Requirement. A scenario defines a single observable behaviour that contributes towards satisfying a requirement. For example, a single GIVEN/WHEN/THEN cannot communicate architectural constraints, testing decisions, domain terminology or non-functional requirements without additional context.

When implementing a Scenario, the AI agent first understands the Requirement in the context of the overall system, architectural decisions, testing decisions, domain language & existing codebase. It then determines the smallest vertical slices required to satisfy that Scenario. Those slices may include implementation work, acceptance tests or edge cases that are implied by the Requirement but not explicitly written in the GIVEN/WHEN/THEN. 

More often than not, a single Scenario will map to a single acceptance test. However, by giving the agent the context of the entire Requirement, it is able to reason about implied behaviour, implementation trade-offs & edge cases instead of simply translating the GIVEN/WHEN/THEN into code.

The scenario defines a behaviour that must be observable. The Requirement provides the context for the scenario. The implementation discovers everything required to make that behaviour a reality.

### An Example Requirement
Note: Templates are still a work in progress.

```markdown
### Requirement: Authenticated user can upload an avatar

The system SHALL allow authenticated users to upload a profile avatar. Users upload an image via `POST /api/users/me/avatar` using `multipart/form-data`. Exactly one image file is accepted. The image is validated, processed into a canonical 256×256 square WebP avatar (center-cropped where necessary), stored, and the resulting public URL is persisted to `User.image`. Uploads are always scoped to the authenticated user (`/me`), meaning users can only upload or replace their own avatar. A successful upload replaces any existing avatar rather than creating multiple avatars for the same user.

#### Scenario: Successful upload of a square JPEG
- **GIVEN** an authenticated user whose `User.image` is `null`
- **WHEN** the user posts a valid 512×512 JPEG under 5 MB to `/api/users/me/avatar`
- **THEN** the system responds `200` with the new avatar URL
- **AND** `User.image` for that user is updated to a public URL whose path is `avatars/<userId>.webp` with a `?v=<timestamp>` cache-bust query parameter
- **AND** a processed avatar object (256×256 WebP) has been stored at key `avatars/<userId>.webp`

#### Scenario: Non-square image is center-cropped to square
- **GIVEN** an authenticated user
- **WHEN** the user posts a valid 1000×750 (non-square) image
- **THEN** the system responds `200` and stores a 256×256 square processed avatar (center-cropped), not the original aspect ratio

#### Scenario: Re-upload overwrites the previous avatar
- **GIVEN** an authenticated user who already has an avatar (`User.image` set)
- **WHEN** the user posts a new valid image
- **THEN** the system overwrites the stored object at the same key `avatars/<userId>.webp`
- **AND** `User.image` is updated with a new `?v=<timestamp>` value so caches refetch
- **AND** no second/orphan object is created (one object per user)

#### Scenario: Storage write succeeds before the database is updated
- **GIVEN** an authenticated user
- **WHEN** the user posts a valid image
- **THEN** the processed avatar is written to storage first, and `User.image` is only updated after the storage write succeeds
- **AND** the database never holds a URL pointing at a non-existent stored object

##### Architectural Decisions
- New `POST /api/users/me/avatar` controller action accepting `multipart/form-data`; current user resolved via the existing current-user decorator. `/me` scoping eliminates any IDOR surface (no user id in the path).
- Upload is processed server-side, in-process: validate → resize/normalize with `sharp` → store via the `StorageService` port → write URL to `User.image` via the user repository.
- Canonical processed avatar is exactly one 256×256 square WebP, center-cropped for non-square inputs. One size only; clients downscale via CSS.
- `User.image` is plain profile data; no domain behavior or invariants are added to the `User` aggregate.
- R2-first write ordering: the stored object must exist before the DB URL is persisted, so a DB-write failure can at worst orphan a tiny file, never produce a dangling URL.

##### Testing Decisions
- Seam: the existing controller integration-test harness (`bootstrapIntegrationTest` + supertest), same pattern as `change-password.integration.test.ts`. The HTTP endpoint, multipart parsing, auth, use-case, and repository are all exercised against a real Postgres.
- A `FakeStorageService` (in-memory) is swapped in via the existing `swaps` mechanism on the bootstrap helper (identical to how `MockEmailService` / `MockPaymentService` are injected today). The fake records `put`/`delete` calls and exposes stored bytes by key, so scenarios assert the object exists and is a 256×256 WebP without needing real R2 or its credentials.
- Modules exercised: the avatar controller, the upload/remove use-cases, `User` repository, `sharp`-based processing, and the `FakeStorageService`. Asserts observable HTTP status, the persisted `User.image` value shape, and the fake's recorded storage operations.

##### Out of Scope
- Multi-size avatar variants (32/64/128/256). One 256×256 size only.
- Animated avatar formats (GIF/AVIF) and SVG.
- Background/async processing via Inngest — avatars are processed synchronously in-process.
- Orphan-file reconciliation/cleanup job; failed-retry overwrites the same key idempotently.
- Locking or serialization of concurrent same-user uploads (last-write-wins by design).

##### Further Notes
- The stored URL includes a `?v=<updatedAt>` param precisely so the immutable-looking key `avatars/<userId>.webp` can be safely overwritten while still defeating stale CDN/browser caches. See ADR-0001.
```

## Workflow

The workflow has two phases:

### Phase 1: Understanding the problem
#### 1.1 Grill
A grilling session that ensures a common understanding of the problem that requires solving relative to the existing system between the user & the AI agent.

#### 1.2 Proposal
Produces a concise document that formalises the **why** (not the how) behind the change required as per the previous discussion. The user is expected to iterate on this if they feel the AI agent is still lacking rationale & understanding.

#### 1.3 Specs
Breaks down the proposed change into formalised requirements supplemented with GIVEN/WHEN/THEN scenarios that describe the new expected system behaviour. Each scenario's behaviour should be testable & its testing boundary seam is identified.

#### 1.4 Design
Produces a concise document that formalises the **why** (not the how) behind any major high-level architectural decisions (cross-cutting changes, external dependencies, security, ambiguity, etc) that the current requirements will require. No code is to be written at this stage. The user is expected to iterate on this if they feel the AI agent is proposing something infeasible.

#### 1.5 Tasks
With scenarios defined & high-level architecture decisions made, this knowledge is combined. Breaks down each scenario in to a set of one or more vertical slices & the high-level tasks required to implement it with a RED/GREEN/REFACTOR cycle. The tasks are high-level & do not describe step by step what code changes are required - this is intentional because the implementation detail should not be decided up front & will likely be inaccurate for complex projects.

### Phase 2: Solving the problem** 
Implements one scenario at a time from 1.5 using Acceptance Test Driven Development (double-loop TDD).
Upon completion, performs a code review of the changes with another model before a final code review requested from the human.
When all parties are satisfied, commit is done before moving on to implementing the next scenario.

