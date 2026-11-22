# CLAUDE.md — Pharaxis One

Claude Code reads this file at the start of every session. It only points the way. **The rules are in [`docs/RULES.md`](docs/RULES.md). Read it before writing code.**

| Read | For |
|---|---|
| [`docs/RULES.md`](docs/RULES.md) | Team, how work flows, proving it works, getting to `main`, how we talk, how the AI works, never-do list, lessons |
| [`docs/PRD.md`](docs/PRD.md) | What we build and for whom |
| [`docs/ARCHITECTURE_AND_SYSTEM_DESIGN.md`](docs/ARCHITECTURE_AND_SYSTEM_DESIGN.md) | Architecture & System Design: building blocks, stack, security, decisions; then flows, jobs, data, routes, how to run each app |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Colours, fonts, components |
| [`docs/TASKS.md`](docs/TASKS.md) | The work in hand |
| [`docs/PROGRESS.md`](docs/PROGRESS.md) | What is done, what broke, what is next |

**The seven hard rules** (RULES.md › Hard rules), so no session starts without them:

1. Push only with Rohith's word. Never push to `main`.
2. Done means seen on the real screen. A ticket is Done only when merged to `main`.
3. Pharaxis One has no customers.
4. Evidence or nothing. References in one block at the foot.
5. Work on a branch; open a pull request, even for one line.
6. Plain English, one or two lines. Commit messages and PRs name what changed.
7. Nothing new at the top level. New folders go in `apps/` or `docs/`.

**Team** (RULES.md › Who does what): Rohith (Founder & CEO, signs everything, every push). Four teams, each head reporting to Rohith; everyone but Rohith is a simulated persona with no GitHub account. **Product** Saad (CPO) · Vanaja (PM) · Vinay (BA) · Ajay (UI/UX). **Development** Varun (CTO: designs, reviews, merges) · Bhavya, Vivek, Anirudh (write the code) · Radhika (DevOps & AI). **QA & Compliance** Swaroop (head, compliance owner) · Kiranmai (screen walks, second reader) · Venkatesh (CI tests, scripted walks) · Rajesh (validation). **Medical Affairs** John (CMO, clinical sign-off) · Carol (MI & safety) · Lauren (writer, MLR) · **Client** Katrina, simulated, reports to John. `@Name` or `/name` means that person answers; no name means the head whose area it is answers.
