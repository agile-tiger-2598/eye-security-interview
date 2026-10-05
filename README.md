# Eye Security interview challenge

## Architecture decisions

- [Initial architecture](docs/adr/0001-architecture.md)
- [Language choice and tooling](docs/adr/0002-language-choice-tooling-libraries.md)

## Implementation status

The initial implementation is working and submits the full example CSV, barring a few invalid records, to the analytics service successfully, is robust to the enrichment service's shenanigans, and observes the analytics service's rate limits.

The CLI shows progress to the user and can detach / attach without killing the import.

A few things could be better:

- `--filter` has not been implemented for the CLI.
- The rate limiting for the analytics worker is a bit ugly. We add a constant 500ms as we don't really handle the 429s elegantly and instead incur a 10s penalty if one happens. This _works_, but the whole pipeline could be ~5% faster.
- Although it's possible with Bun, the CLI bundle step into an executable binary is not configured.
- I did not add full end-to-end tests and the coverage could be a lot better in general. I did not want to commit slop tests just to add more coverage.
- I did not get to test the dead letter queues as the system works. :P

## Development

### Requirements

- [Bun](https://bun.com/)
- [Docker + Compose](https://docs.docker.com/compose/)

### Install

```sh
bun install --frozen-lockfile
cp cli/.env_example cli/.env
cp api/.env_example api/.env
# add the heyering authorization secret to the api env as HEYERING_API_TOKEN.
```

### Develop

```sh
# start the database and apply pending migrations
bun run db:up
bun run dbmate up

# start the backend
bun run api:start

# terminal #2: call the development CLI
./bin/cli upload docs/example_data.csv
```

### Workspaces

| Workspace                           | Directory    | Purpose              |
| ----------------------------------- | ------------ | -------------------- |
| `@eye-security-interview/cli`       | `cli/`       | CLI                  |
| `@eye-security-interview/api`       | `api/`       | API                  |
| `@eye-security-interview/contracts` | `contracts/` | Shared zod contracts |

## Development commands

| Command                | Action                                   |
| ---------------------- | ---------------------------------------- |
| `./bin/cli ...`        | Run the CLI                              |
| `bun run api:dev`      | Run the API and restart it after changes |
| `bun run api:start`    | Run the API                              |
| `bun run check`        | Type-check each workspace                |
| `bun run format`       | Format supported project files           |
| `bun run format:check` | Check formatting without changing files  |
| `bun run lint`         | Lint the project                         |
| `bun run test`         | Run all Bun tests                        |
| `bun run db:up`        | Start PostgreSQL and wait for health     |
| `bun run db:down`      | Stop PostgreSQL and preserve its data    |
| `bun run dbmate up`    | Apply pending API database migrations    |
| `bun run dbmate ...`   | Run another dbmate command               |
