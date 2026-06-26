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

## What is a Scenario?

Whilst Scenario-Driven Development uses the familiar Given/When/Then format from BDD, the scenario is only one part of a larger requirement. Each scenario sits beneath a behavioural requirement, which describes the capability in natural language & provides added context that the Given/When/Then alone cannot.

This follows the principles of Specification by Example. The requirement describes the behaviour. The scenarios provide concrete examples of that behaviour. A single requirement will often contain multiple scenarios covering the expected behaviour of the capability.

A good scenario is:

Behaviour-focused — describes observable system behaviour, not implementation details.
Acceptance-testable — can be verified end-to-end through an external testing seam.
Independently deliverable — can be implemented, reviewed & validated in a single iteration.
A vertical slice — delivers working software across the entire system rather than completing one technical layer.
A learning opportunity — provides feedback that informs the design of the scenarios that follow.

Importantly, the AI agent should not treat the Given/When/Then as an exhaustive implementation checklist.

Instead, it should first understand the surrounding requirement, architectural decisions, testing decisions & domain context. It should then determine the smallest vertical slices required to satisfy the scenario. Those slices may include additional implementation work, acceptance tests or edge cases that are implied by the requirement but not explicitly written in the Given/When/Then.

The Given/When/Then defines the behaviour that must be observable. The implementation discovers everything required to make that behaviour a reality.

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

**Phase 2: Solving the problem** — work the tasks through the ATDD cycle: red acceptance test → minimal code to green → refactor, one vertical slice at a time.

