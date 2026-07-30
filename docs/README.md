# UltisPro — Phase 1 Planning Package

Read in this order:

1. [01-functional-requirements.md](01-functional-requirements.md) — personas, tenancy model, functional requirements by module, NFRs, MVP scope
2. [02-system-architecture.md](02-system-architecture.md) — architecture style, component diagram, multi-tenancy, auth, caching/queues, security, tech justification (**note:** flags a deliberate deviation from the original brief — BullMQ instead of Celery — see §8)
3. [03-database-design.md](03-database-design.md) — full PostgreSQL DDL (~38 tables) and ERD
4. [04-module-breakdown.md](04-module-breakdown.md) — all modules with entities, APIs, screens, dependencies
5. [05-development-roadmap.md](05-development-roadmap.md) — phased build order and why
6. [06-design-system.md](06-design-system.md) — design tokens and components extracted from the approved mockups in `ultisPro-design/`

## Status

Planning package complete. Per your process, no code has been generated yet. Awaiting your review and approval to begin **Phase 0 (foundation scaffold)** from the roadmap.

## Open Decision for Your Sign-Off

The original tech list specified **Celery** for background jobs, which is a Python-ecosystem tool. Since the backend is Node.js/Express, 02-system-architecture.md §8 recommends **BullMQ** (Redis-backed, TypeScript-native) instead, keeping RabbitMQ in the stack for future cross-service events. Flag if you'd rather keep a Python worker service alongside the Node API for Celery specifically.
