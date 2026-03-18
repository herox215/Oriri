# Oriri — Simple Task Board

A simple task board with CLI, TUI, and MCP interface.

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

### Dependency Injection

Constructor Injection — Classes receive their dependencies as interfaces in the constructor. No DI framework, manual wiring in a composition root.

```typescript
class TaskService {
  constructor(private storage: StorageInterface) {}
}

function bootstrap() {
  const storage = new FilesystemStorage(basePath);
  const tasks = new TaskService(storage);
  return { storage, tasks };
}
```

### StorageInterface — The Central Abstraction

All file operations go through the `StorageInterface` (4 methods: readTask, writeTask, listTasks, deleteTask). Never use `fs.*` directly (sole exception: Config-Loader, which reads `config.yaml` before storage is initialized).

### Data Format

- Tasks are **Markdown files** with a metadata table (id, status, created_at) and description section
- Only non-Markdown file: `.oriri/config.yaml` (YAML, machine-parsed)
- Task statuses: `open` | `done`

### Source Directory Structure

```
src/
  cli/              ← CLI entry points (init, do, delete, tui, mcp-serve)
  config/           ← Config-Loader (only module that uses fs.* directly)
  storage/          ← StorageInterface + FilesystemStorage adapter
  tasks/            ← Task data model, CRUD, ID generation
  mcp/              ← MCP server, 3 tool definitions
  shared/           ← Shared types, errors, default content
```

### CLI Commands

- `oriri init` — Initialize `.oriri/` directory
- `oriri do "TEXT"` — Create a new task
- `oriri delete ID` — Delete a task
- `oriri tui` — Interactive dashboard
- `oriri mcp-serve` — Start MCP server (stdio)

### MCP Tools

- `create_task` — Create a new task (title, description)
- `delete_task` — Delete a task (task_id)
- `execute_task` — Mark a task as done (task_id)

### Runtime Directory Structure (.oriri/)

```
.oriri/
  config.yaml       ← Project configuration
  tasks/            ← Task files (task-{id}.md)
```

## Coding Conventions

- Filenames: **kebab-case** (`task-service.ts`, `filesystem-storage.ts`)
- No default exports, always named exports
- Tests next to the code: `foo.ts` → `foo.test.ts`
- No `any` types — if necessary, use `unknown` with type guard
- Async/await instead of callbacks or .then() chains

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

class TaskNotFoundError extends OririError {
  constructor(id: string) {
    super(`Task ${id} not found`, 'TASK_NOT_FOUND');
  }
}
```

Throw errors early, never silently swallow them.
