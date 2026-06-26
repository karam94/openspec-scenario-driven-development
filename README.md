# Scenario Driven Development (a custom schema for [OpenSpec](https://openspec.dev/))

A mutation of the default OpenSpec workflow that combines **Spec-Driven Development**, **Vertical Slicing (Tracer Bullets)**, and **Acceptance Test-Driven Development (Double-Loop TDD)** into a single iterative delivery model.

Specifications are refined through small, end-to-end increments that provide fast feedback and continuous validation — enabling pragmatic and sustainable AI-assisted software engineering while avoiding the pitfalls of a waterfall approach.

## Install

TODO

## Overview

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

