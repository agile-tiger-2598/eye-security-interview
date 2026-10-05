# Eye Security interview challenge

## Architecture decisions

- [Language choice and tooling](docs/adr/0001-language-choice-and-tooling.md)

## Development

### Requirements

- Bun
- Docker + Compose

### Install

```sh
bun install --frozen-lockfile
cp api/.env_example api/.env
cp cli/.env_example cli/.env
```

### Develop

```sh
# start the database and apply pending migrations
bun run db:up
bun run dbmate up

# start the backend
bun run api:dev

# terminal #2: call the development CLI
bun run cli upload docs/example_data.csv
```

### Workspaces

| Workspace                           | Directory    | Purpose              |
| ----------------------------------- | ------------ | -------------------- |
| `@eye-security-interview/cli`       | `cli/`       | CLI                  |
| `@eye-security-interview/api`       | `api/`       | API                  |
| `@eye-security-interview/contracts` | `contracts/` | Shared zod contracts |

### API

The API reads its settings from `api/.env`. It listens on `API_HOST` and
`API_PORT`. The default address is `http://127.0.0.1:3000`.

The liveness endpoint is `GET /healthz`.

## Development commands

| Command                | Action                                   |
| ---------------------- | ---------------------------------------- |
| `bun run api:dev`      | Run the API and restart it after changes |
| `bun run api:start`    | Run the API                              |
| `bun run cli`          | Run the CLI                              |
| `bun run check`        | Type-check each workspace                |
| `bun run format`       | Format supported project files           |
| `bun run format:check` | Check formatting without changing files  |
| `bun run lint`         | Lint the project                         |
| `bun run test`         | Run all Bun tests                        |
| `bun run db:up`        | Start PostgreSQL and wait for health     |
| `bun run db:down`      | Stop PostgreSQL and preserve its data    |
| `bun run dbmate up`    | Apply pending API database migrations    |
| `bun run dbmate ...`   | Run another dbmate command               |
