---
name: atdd
description: Acceptance test-driven development. Use when implementing features, fixing bugs, modifying behavior, or when the user requests TDD, ATDD, red-green-refactor, integration testing, or test-first development.
---

# Acceptance Test-Driven Development (ATDD)

## Philosophy

**Core principle**: Tests should verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't.

**Good tests** are integration-style: they exercise and verify behaviour through public interfaces. They describe _what_ the system does, not _how_ it does it. A good test reads like a specification - "user can checkout with valid cart" tells you exactly what capability exists. These tests survive refactors because they don't care about internal structure.

**Bad tests** are coupled to implementation. They mock internal collaborators, test private methods, or verify through external means (like querying a database directly instead of using the interface). The warning sign: your test breaks when you refactor, but behavior hasn't changed. If you rename an internal function and tests fail, those tests were testing implementation, not behavior.

See [tests.md](tests.md) for examples and [mocking.md](mocking.md) for mocking guidelines.

## Acceptance Test Driven Development (ATDD) Explained

ATDD is a methodology of TDD from the book "Growing Object-Oriented Software, Guided by Tests" by Steve Freeman and Nat Pryce. Acceptance tests (behavioural tests) drive implementation. When useful, unit tests help drive the design and implementation of complex components required to satisfy those acceptance tests.

### The ATDD Cycle

**Outer Loop**
├── 1. Write FAILING acceptance test
├── 2. Complete Inner Loop cycles until acceptance PASSES
│   └── **Inner Loop** (unit test → component)
│       ├── a. Write FAILING unit test
│       ├── b. Make unit test PASS
│       └── c. REFACTOR component
│           └── Repeat a-c until acceptance test passes
├── 3. REFACTOR whole system
└── 4. Repeat for next acceptance criterion

#### Outer Loop

Acceptance or integration tests define user-visible behavior.

These tests answer: How do we know the feature works?

Acceptance tests exercise the system through public interfaces:

- HTTP APIs
- UI interactions
- CLI commands
- Event-driven workflows
- Message queues

#### Inner Loop

When useful, unit tests drive the implementation required to satisfy the acceptance test. Not every acceptance test requires lower-level unit tests. When complex business logic emerges, focused unit tests can support the acceptance tests and help drive the design of deeper modules.

These tests answer: What component behavior is required to make the acceptance test pass?

#### In Conclusion
Acceptance Tests are the Tracer Bullet test.
Lower level unit tests within the inner loop should be written only for testing complex business logic behaviour of modules, not implementation detail. 100% test coverage is NOT the goal with the lower level unit tests within the inner loop.

## Anti-Pattern: Horizontal Slices

**DO NOT write all acceptance tests first, DO NOT write all unit tests first, then all implementation.** This is "horizontal slicing" - treating RED as "write all tests" and GREEN as "write all code."

This produces **crap tests**:

- Tests written in bulk test _imagined_ behavior, not _actual_ behavior
- You end up testing the _shape_ of things (data structures, function signatures) rather than user-facing behavior
- Tests become insensitive to real changes - they pass when behavior breaks, fail when behavior is fine
- You outrun your headlights, committing to test structure before understanding the implementation

**Correct approach**: Vertical slices via tracer bullets. One test → one implementation → repeat. Each test responds to what you learned from the previous cycle. Because you just wrote the code, you know exactly what behavior matters and how to verify it.

```
WRONG (horizontal):
  RED:   test1, test2, test3, test4, test5
  GREEN: impl1, impl2, impl3, impl4, impl5

RIGHT (vertical):
  RED→GREEN: acceptance1→test1→impl1
  RED→GREEN: acceptance2→impl2 (you might choose not to write unit tests)
  RED→GREEN: acceptance3→test2→test3→impl3
  ...
```

## Design Feedback

Tests are not only verification tools.

They are design tools.

If a test is difficult to write, requires excessive setup, or demands extensive mocking, treat this as feedback about the design.

Test friction is often a design smell.

Prefer designs that are easy to exercise through their public interfaces.

## Workflow

### 1. Planning

When exploring the codebase, read `CONTEXT.md` (if it exists) so that test names and interface vocabulary match the project's domain language, and respect ADRs in the area you're touching.

Before writing any code:

- [ ] Confirm with user what interface changes are needed
- [ ] Confirm with user which behaviors to test (prioritize)
- [ ] Identify opportunities for deep modules (small interface, deep implementation) — run the `/codebase-design` skill for the vocabulary and the testability checks
- [ ] List the behaviors to test (not implementation steps)
- [ ] Get user approval on the plan

Ask: "What should the public interface look like? Which behaviors are most important to test?"

**You can't test everything.** Confirm with the user exactly which behaviors matter most. Focus testing effort on critical paths and complex logic, not every possible edge case.

### 2. Tracer Bullet

Write ONE acceptance test that confirms ONE thing about the system:

```
RED:   Write test for first behavior → test fails
GREEN: Write minimal code to pass → test passes
```

This is your tracer bullet - proves the path works end-to-end.
You might optionally choose to write inner loop lower level unit tests where it may help you turn the tracer bullet from RED to GREEN.

### 3. Incremental Loop

For each remaining behavior:

```
RED:   Write next test → fails
GREEN: Minimal code to pass → passes
```

Rules:

- One test at a time
- Only enough code to pass current test
- Don't anticipate future tests
- Keep tests focused on observable behavior

### 4. Refactor

After all tests pass, look for [refactor candidates](refactoring.md):

- [ ] Extract duplication
- [ ] Deepen modules (move complexity behind simple interfaces)
- [ ] Improve cohesion
- [ ] Reduce coupling
- [ ] Simplify interfaces
- [ ] Consider what new code reveals about existing code
- [ ] Run tests after each refactor step

**Never refactor while RED.** Get to GREEN first.

## Checklist Per Cycle

```
[ ] Test describes behavior, not implementation
[ ] Test uses public interface only
[ ] Test would survive internal refactor
[ ] Code is minimal for this test
[ ] No speculative features added
```