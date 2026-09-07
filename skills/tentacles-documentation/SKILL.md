---
name: tentacles-documentation
description: This skill generates or updates service documentation for all detected components in a repository. It performs a deep scan of the codebase, identifies components, and creates a comprehensive document that explains the purpose, architecture, and behavior of each component. The documentation is intended to assist software engineers in understanding the system and to provide context for AI-driven discussions with non-technical stakeholders.
---

A service is a collection of components that work together to solve a business problem. Each component has a specific purpose and interacts with other components in the system. The service documentation follows the bundled template at `${CLAUDE_PLUGIN_ROOT}/skills/tentacles-documentation/templates/TENTACLES.md` and lives under `.tentacles/TENTACLES.md` in the user's current project. That `${CLAUDE_PLUGIN_ROOT}/…` path points at the installed plugin directory — expanded automatically in Claude Code, and shipped as an absolute path into the clone in the Kiro skill copy.

A component is a self-contained unit of functionality that can be independently developed, tested, and deployed. Each component detected in the codebase, should generate documentation following the bundled template at `${CLAUDE_PLUGIN_ROOT}/skills/tentacles-documentation/templates/COMPONENT.md` and live under `.tentacles/components/<component-name>.md`. If the component is a database, then an entity relationship diagram should be included and every table should be documented with its fields, types, and relationships to other tables.

If `TENTACLES.md` does not exist in the `.tentacles` directory of the repository, your job is to create it.

If `TENTACLES.md` already exists in the `.tentacles` directory of the repository, your job is to update it & any corresponding component documentation based on the latest scan of the codebase and your findings.

Perform a deep scan of this repository to identify all components, their interactions and their dependencies.

Interview me relentlessly about every aspect of your findings until we reach a shared understanding.

Before you proceed, ask the user to confirm every component that you detect in the codebase & confirm that the name of each component is correct.

Walk through each component, asking detailed questions about its purpose, functionality, business problem being solved and any edge cases or unclear behaviors. For each question, provide your recommended answer.

Ask the questions one at a time, waiting for feedback on each question before continuing. Asking multiple questions at once is bewildering.

You will also ask me to clarify any ambiguities in the codebase, and you will provide your recommended answer for each question.

If a _fact_ can be found by exploring the codebase, look it up rather than asking me. The _decisions_, though, are mine — put each one to me and wait for my answer.

The output documents will serve as a comprehensive reference for software engineers and AI agents, detailing the architecture, purpose, and behavior of each component in the system. It will also provide context for AI-driven three amigo sessions, discussions and help clarify any ambiguities in the codebase.