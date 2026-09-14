# Agent engineering on StoreSplit (frontend)

The long version of the README's summary: what "agent-built" means here, what I did, the
review loops the interface went through, and what this project does and does not claim to
have measured. The backend repository carries the same account for the API and pipeline.

StoreSplit is a personal, hobby-scale engineering project built in my free time, and it is
also a real test environment for my local AI coding-agent setup.

**StoreSplit is the application.** The reusable agent configuration — hooks, skills, review
agents, rules, and the benchmark methodology behind them — lives in a separate public
repository, [zsz13/claude-code-config](https://github.com/zsz13/claude-code-config), and is
not duplicated here.

On the frontend specifically, this codebase was a useful test of whether agent workflows hold
up on the things that are awkward to automate: UI state that spans dialogs, filters and
persisted storage; accessibility behaviour that only shows up when you drive the rendered
page; visual regressions that no unit test catches; and copy, which is where a confident
generator is most likely to say something untrue about a price.

## How this was built

StoreSplit was implemented through coding agents working under my direction, as a deliberate
experiment in agent-based software engineering. I did not hand-type the implementation, and
this repository does not pretend otherwise.

What that means in practice: I identified the problem, defined the product and its
requirements, chose the architecture and the invariants the interface has to hold, decomposed
the work into tasks an agent could execute, designed the prompts and constraints for those
tasks, reviewed what came back, rejected what was wrong, drove debugging and root-cause
investigation through the agents, and defined the validation every change had to survive
before it landed.

**Agent-built does not mean unreviewed or blindly accepted.** Changes went through structured
review loops — adversarial review by independent reviewer agents, a dead-code audit, a
complexity/simplification review, and visual review of the rendered interface in a real
browser — and through deterministic gates that do not care what produced the diff: Vitest,
ESLint, `tsc --noEmit`, Prettier, and a production build. Agent output that failed a gate,
contradicted an invariant, or proposed an abstraction the architecture did not need was
rejected rather than merged.

[DESIGN-BRIEF.md](../DESIGN-BRIEF.md) is the visual and product direction the interface was built
against — written first, and used as the constraint agents had to satisfy rather than a
description written afterwards.

## My role

- Identifying the product opportunity and defining requirements
- Product decisions and scope
- Interface architecture, component boundaries, and the design brief
- Decomposing work into agent-executable tasks
- Designing prompts, constraints, and invariants
- Reviewing agent output, and rejecting it where warranted
- Debugging and root-cause investigation through agents
- Defining validation requirements and building the review loops
- Adversarial review, dead-code review, and simplification review
- Test strategy, including what must be provable without a DOM
- Benchmarking the agent workflows themselves
- Evaluating failures and rejected agent suggestions
- Iteration and orchestration across backend and frontend

## On benchmark claims

This project was used to _exercise_ those workflows. That is a different statement from having
measured them, and the difference matters.

No claim is made here that agents made development faster, produced better code than a human
would have, or improved quality by some percentage. I have not run the controlled comparison
that would support any of those claims, so this repository does not make them. Methodology and
results for the agent workflows themselves belong in
[claude-code-config](https://github.com/zsz13/claude-code-config), not here.

---
