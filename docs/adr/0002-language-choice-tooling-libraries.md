---
title: Language choice, tooling & libraries
status: accepted
date: 2026-10-04
deciders: ["Felix Spöttel"]
---

## Decision

### Language

Strict type safety is a requirement for a mission-critical system. The project shall therefore use strict `typescript` through bun, as the team is most familiar with `TypeScript` among available language options.

Go would have been a good - arguably better - choice here too. One key advantage Go has for the CLI is that it compiles to a single-file executable, which makes distribution easy. We chose Bun here as it [can do the same](https://bun.com/docs/bundler/executables) for a TypeScript-based app.

### Tooling

- `bun` as toolchain
- `oxlint`/`oxfmt` as linter and formatter
- `dbmate` for database migrations
- `docker (+ compose)` for development. We only dockerize the API dependencies (e.g. Postgres) so we can use simple `localhost`-based development for the API while retaining the benefits of a dockerized development setup.

### Libraries

- `zod` as runtime schema validation
- `hono` as API framework
- `pg-boss` as a Postgres-based job queue
