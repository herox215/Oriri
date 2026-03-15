# Oriri — AI-First Ticketing System

A ticketing system built primarily for AI agents. Humans interact via a simple task list, not via tickets.

## Tech-Stack

- **Runtime:** Node.js + TypeScript (strict mode)
- **Package Manager:** pnpm
- **Build:** tsup
- **Test:** vitest
- **Linter:** eslint + prettier
- **CLI:** `npx oriri` (bin entry in package.json)
- **MCP SDK:** `@modelcontextprotocol/sdk` (stdio transport in local mode)

## Dev-Commands

```bash
pnpm build          # Compile TypeScript
pnpm test           # Run Vitest
pnpm lint           # Check ESLint + Prettier
pnpm lint:fix       # ESLint + Prettier auto-fix
```

## Architecture

### Extensibility as a Guiding Principle

The architecture is designed to be extensible at every point without having to touch existing code. New storage backends, agent roles, A2A types, or MCP tools must be pluggable without modifying core modules.

In concrete terms this means:

- **Interfaces before implementations** — Core logic works against interfaces, never against concrete classes
- **Adapter pattern for I/O** — Storage, transport, notifications are swappable adapters
- **Registry pattern for extensions** — Roles, A2A types, tool sets are registered, not hardcoded
- **No god object** — Clear module boundaries, each module has a single responsibility

### Dependency Injection

Constructor Injection — Classes receive their dependencies as interfaces in the constructor. No DI framework, manual wiring in a composition root.

```typescript
// Classes define their dependencies in the constructor
class TaskService {
  constructor(
    private storage: StorageInterface,
    private logger: LogService,
  ) {}
}

// Composition root wires everything at startup
function bootstrap(config: OririConfig) {
  const storage = createStorageAdapter(config.mode);
  const logger = new LogService(storage);
  const tasks = new TaskService(storage, logger);
  return { storage, logger, tasks };
}
```

### StorageInterface — The Central Abstraction

All file operations go through the `StorageInterface`. Never use `fs.*` directly (sole exception: Config-Loader, which reads `config.yaml` before storage is initialized).

```
Config-Loader (reads config.yaml directly from filesystem)
       ↓
  config.mode determines adapter
       ↓
  StorageInterface
    ├── FilesystemStorage (mode: local)  ← MVP
    └── WebSocketStorage  (mode: server) ← Post-MVP
```

### Data Format

- Tasks, logs, story, A2A tasks are **Markdown files** — the AI interprets the content
- Only non-Markdown file: `.oriri/config.yaml` (YAML, machine-parsed)
- StorageInterface works with **raw strings**, no structured objects

### Source Directory Structure

```
src/
  cli/              ← CLI entry points (init, agent-start, watch, etc.)
  config/           ← Config-Loader (only module that uses fs.* directly)
  storage/          ← StorageInterface + adapters (FilesystemStorage, etc.)
  tasks/            ← Task data model, CRUD, ID generation
  logs/             ← Append-only log system
  agents/           ← Agent roles, registration, runner
  a2a/              ← A2A coordination, consent system
  story/            ← story.md read/write logic, archiving
  mcp/              ← MCP server, tool definitions
  notifications/    ← Notification watcher
  shared/           ← Shared types, errors, utilities
```

### Runtime Directory Structure (.oriri/)

```
.oriri/
  config.yaml          ← Project configuration
  story.md             ← Collective memory
  story.archive.md     ← Archived story entries
  rules.md             ← Consent rules
  agents/active.md     ← Running agents (registry + kill switch)
  tasks/               ← Task files (task-{id}.md, task-{id}.log.md)
  agent-tasks/         ← A2A coordination (a2a-{id}.md)
```

## Coding Conventions

- Filenames: **kebab-case** (`task-service.ts`, `filesystem-storage.ts`)
- No default exports, always named exports
- Tests next to the code: `foo.ts` → `foo.test.ts`
- No `any` types — if necessary, use `unknown` with type guard
- Async/await instead of callbacks or .then() chains
- Commit messages: Conventional Commits with ticket reference (`feat(tasks): add CRUD operations (T-004)`)

### Error Handling

Custom error classes that inherit from `OririError`. Every error has a machine-readable `code` — this is especially important because AI agents need to interpret the errors.

```typescript
class OririError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
  }
}

// Module-specific errors
class TaskNotFoundError extends OririError {
  constructor(id: string) {
    super(`Task ${id} not found`, 'TASK_NOT_FOUND');
  }
}
```

Throw errors early, never silently swallow them.

## Implementation

Order and details are in `TICKETS.md`. The dependency graph there is binding — implement tickets only in the specified order.

Phase 1 (foundation) must be fully complete before Phase 2 begins. Within a phase, independent tickets can be implemented in parallel.
