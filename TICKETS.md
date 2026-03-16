# Oriri Implementation Tickets

Tickets derived from Oriri-Spec-v3-1. Sorted by dependencies — earlier tickets are the foundation for later ones.

> **Agent-Hinweis:** Beim Abschließen eines Tickets die Acceptance Criteria hier in der TICKETS.md abhaken (`- [x]`).

---

## Phase 1: Foundation

### T-001: Project Scaffolding & Toolchain

**Type:** chore
**Dependencies:** none
**Description:**
Initialize project as a TypeScript/Node.js npm package. Build tooling, linter, test framework, TypeScript configuration.

**Stack:**

- TypeScript + Node.js
- Package manager: pnpm or npm
- Build: tsup or tsx
- Test: vitest
- Linter: eslint + prettier
- CLI: as `bin` entry in package.json (`npx oriri`)

**Acceptance Criteria:**

- [x] npm package structure with package.json, tsconfig.json
- [x] TypeScript compiles without errors
- [x] eslint + prettier configured
- [x] vitest runs (empty test run)
- [x] `npx oriri` executes CLI entry point
- [ ] CI pipeline for tests (optional, local is sufficient for MVP)

---

### T-002: Filesystem Structure & Init Command

**Type:** feature
**Dependencies:** T-001
**Description:**
Implement `oriri init` command that creates the `.oriri/` directory structure (Spec Section 3). Creates all seven file types with sensible defaults.

**Affected Files (to be created):**

```
.oriri/
  config.yaml        ← only non-Markdown file (YAML for machine parsing)
  story.md
  story.archive.md
  rules.md
  agents/active.md
  tasks/             (empty directory)
  agent-tasks/       (empty directory)
```

**Acceptance Criteria:**

- [x] `npx oriri init` creates complete structure
- [x] config.yaml has default `mode: local`
- [x] story.md is empty with header
- [x] rules.md contains default consent rules (Majority >50%)
- [x] Double `init` does not overwrite anything / warns
- [x] Error message if `.oriri/` already exists (with `--force` flag)

---

### T-002b: Storage Interface (Abstraction Layer)

**Type:** feature
**Dependencies:** T-002
**Description:**
All file operations go through an abstract `StorageInterface`. In the MVP there is only one implementation: `FilesystemStorage` (reads/writes directly to `.oriri/`). Later a `WebSocketStorage` can be added — without any other code needing to change.

This is the foundation for being able to later simply say: "Connect to this instance via WebSocket" — and everything continues to work.

**Note:** Config reading (`config.yaml`) happens _before_ storage initialization — the config determines which adapter is used. Config reading is the only operation that accesses the filesystem directly.

```typescript
interface StorageInterface {
  // Tasks
  readTask(id: string): Promise<string>; // Returns Markdown
  writeTask(id: string, content: string): Promise<void>;
  listTasks(): Promise<string[]>; // List of task IDs
  deleteTask(id: string): Promise<void>;

  // Logs (append-only)
  appendLog(taskId: string, line: string): Promise<void>;
  readLog(taskId: string): Promise<string>;

  // Story
  readStory(): Promise<string>;
  appendStory(line: string): Promise<void>;

  // A2A
  readA2A(id: string): Promise<string>;
  writeA2A(id: string, content: string): Promise<void>;
  listA2A(): Promise<string[]>;

  // Agents
  readActiveAgents(): Promise<string>;
  writeActiveAgents(content: string): Promise<void>;
}
```

**Acceptance Criteria:**

- [x] `StorageInterface` defined as TypeScript interface
- [x] `FilesystemStorage` implements all methods
- [x] All other modules use only the interface, never `fs.*` directly
- [x] Storage implementation is selected via config (`mode: local` → Filesystem)
- [x] Interface works with raw strings (Markdown) — no structured objects, the AI interprets the content
- [x] Interface is designed so that a WebSocket adapter can be added later without changes to the rest

---

### T-003: Config Loader

**Type:** feature
**Dependencies:** T-002
**Description:**
Load `.oriri/config.yaml`. The only file read directly from the filesystem (before storage initialization), because the config determines which storage adapter is used.

**Acceptance Criteria:**

- [x] Reads `.oriri/config.yaml` (YAML, not Markdown)
- [x] Parses `mode: local` (MVP), later `server | hybrid`
- [x] Parses agent definitions (id, display_name, model, role, capabilities)
- [x] Resolves `${ENV_VAR}` from environment variables
- [x] Validation: error on unknown roles, missing required fields
- [x] Returns typed config object
- [x] Config determines which StorageInterface adapter is instantiated

---

### T-004: Task Data Model & CRUD

**Type:** feature
**Dependencies:** T-002b
**Description:**
Implement task data model per Spec Section 5. Tasks as Markdown files under `.oriri/tasks/`. Includes reading, writing, listing, status updates. All operations go through the StorageInterface.

Tasks are Markdown files interpreted by the AI — no strict schema parsing needed. A task that hasn't had a log update for a long time is implicitly "orphaned" — this is not a separate status but a derived state that an agent recognizes.

**Task Fields (as Markdown):**

- id (8-hex hash from created_by + timestamp + title)
- title, type (feature/bug/chore/escalation)
- status (open, planning, executing, waiting_for_tool, waiting_for_agent, needs_human, awaiting_review, done)
- assigned_to, created_by, created_at
- context_bundle, dependencies
- auto_human_gate (yes/no by type)

**Acceptance Criteria:**

- [x] Task ID generation via hash, collision detection
- [x] task-{id}.md write and read via StorageInterface
- [x] Status transition automatically creates log entry
- [x] listTasks() returns all task IDs
- [x] Auto human gate is automatically set for feature/bug
- [x] No `orphaned` status — derived from log timestamps

---

### T-005: Append-Only Log System

**Type:** feature
**Dependencies:** T-002b, T-004
**Description:**
Log files (`task-{id}.log.md`) as append-only chronological protocol. Every status change, every agent action is logged. Logs survive task deletion.

**Format:**

```markdown
[2026-03-15 14:30:00] agent-alpha | status: open → planning
[2026-03-15 14:30:05] agent-alpha | Analysiere Abhängigkeiten...
[2026-03-15 14:32:00] agent-alpha | status: planning → executing
```

**Acceptance Criteria:**

- [x] appendLog(taskId, agentId, message) appends a line
- [x] Timestamp is set automatically
- [x] Log file is never overwritten, only appended to
- [x] Log exists independently of task.md
- [x] Log read: getLog(taskId) returns all entries

---

## Phase 2: Agent Runtime

### T-006: Agent Roles & Permissions

**Type:** feature
**Dependencies:** T-003, T-004
**Description:**
Implement role system per Spec Section 4.2. Six roles (GENERALIST, CODER, REVIEWER, COORDINATOR, ARCHITECT, OBSERVER) with different permissions on tasks, A2A tasks, and story.md.

**Acceptance Criteria:**

- [x] Each role has defined permissions (claim/read/no access)
- [x] CODER can only claim feature/bug/chore
- [x] REVIEWER only sees awaiting_review tasks for claiming
- [x] COORDINATOR only claims A2A tasks
- [x] OBSERVER is read-only, no claiming
- [x] All except OBSERVER can vote
- [x] Role check on every claimTask() / createA2A()

---

### T-007: Task Claiming

**Type:** feature
**Dependencies:** T-004, T-006
**Description:**
Self-assignment mechanism: Agent claims a task by setting the status and assigned_to in the task.md. In case of race conditions (two agents write simultaneously), the first writer wins — the second one recognizes on the next read that the task is already assigned and moves on.

Stale claims (agent crashes, lock remains) are not resolved via disconnect detection, but via self-healing: another agent notices that the log has no more updates and creates an A2A `agent_silent` task (see T-009).

**Acceptance Criteria:**

- [x] claimTask() sets status to `planning` and `assigned_to` in task.md
- [x] Role check before claiming
- [x] Log entry on successful claim
- [x] No explicit lock management — self-healing for stale claims

---

### T-008: Agent Registration & Control

**Type:** feature
**Dependencies:** T-003, T-007
**Description:**
`agents/active.md` is the central control file for all running agents. It serves simultaneously as a registry and as a kill switch:

- **Start:** Agent registers itself
- **Running:** Agent checks on every loop whether it is still listed
- **Stop:** Human (or another agent) deletes the line → Agent notices this and shuts down cleanly

```markdown
# Active Agents

| ID             | Rolle    | Model             | PID   | Seit       |
| -------------- | -------- | ----------------- | ----- | ---------- |
| agent-alpha    | CODER    | claude-sonnet-4-6 | 48291 | 2026-03-15 |
| agent-reviewer | REVIEWER | claude-haiku-4-5  | 48305 | 2026-03-15 |
```

The human can open this file at any time and remove an agent. No CLI command needed — the file is the interface.

Additionally, there are convenience commands:

```bash
npx oriri agent-stop --agent-id agent-alpha    # Removes from active.md
npx oriri agent-stop --all                     # Stop all agents
npx oriri agent-list                           # Shows active.md
```

**Acceptance Criteria:**

- [x] Agent registers itself at start in `agents/active.md` (ID, role, model, PID, timestamp)
- [x] Agent checks on every loop iteration whether it is still in active.md
- [x] If agent is no longer in active.md: finish current task cleanly, then shutdown
- [x] Graceful shutdown via SIGTERM/SIGINT (removes itself)
- [x] `npx oriri agent-stop --agent-id X` removes agent from active.md
- [x] `npx oriri agent-stop --all` clears active.md
- [x] `npx oriri agent-list` shows all registered agents
- [x] Stale entries are cleaned up via self-healing (T-009)

---

### T-008b: Agent Runner (LLM API Loop)

**Type:** feature
**Dependencies:** T-008, T-004, T-005, T-010
**Description:**
Long-lived agent process that runs continuously and independently processes tasks. The agent runner is an infinite loop with two modes:

**Working:** Agent has claimed a task and is processing it. Calls the LLM API (e.g., Anthropic), gives the model the Oriri tools + project files, executes tool calls until the task is finished.

**Idle:** No open task available. Agent waits and checks every 10 minutes whether new tasks exist. While idle, it also checks for stale tasks of other agents (self-healing).

```
npx oriri agent-start --agent-id agent-alpha
```

```
┌──────────────────────────────────────────────┐
│  Agent-Runner Loop                           │
│                                              │
│  while (true) {                              │
│    tasks = listTasks(open, myRole)            │
│                                              │
│    if (tasks.length > 0) {                   │
│      task = pickBestTask(tasks)               │
│      claimTask(task)                          │
│                                              │
│      // LLM API Loop                         │
│      while (task not finished) {              │
│        response = anthropic.messages.create({ │
│          model: config.model,                 │
│          system: systemPrompt + story.md,     │
│          tools: oririTools + codeTools,        │
│          messages: taskContext                 │
│        })                                     │
│        executeToolCalls(response)             │
│        appendLog(task, progress)              │
│      }                                        │
│                                              │
│      completeTask(task, summary)              │
│    } else {                                  │
│      // Idle — nothing to do, so housekeeping │
│      checkForStaleTasks()   // Stale logs?    │
│      checkOpenA2A()         // Open votes?    │
│      respondToA2A()         // Vote ourselves │
│      sleep(10 min)                            │
│    }                                          │
│  }                                            │
└──────────────────────────────────────────────┘
```

**Tools the agent provides to the LLM:**

- Oriri tools: list_tasks, claim_task, append_log, complete_task, get_story, create_a2a, vote
- Code tools: read_file, write_file, run_command, search_files
- The LLM decides on its own which tools to use and when

**Acceptance Criteria:**

- [x] `npx oriri agent-start --agent-id agent-alpha` starts a persistent process
- [x] Reads agent config from config.yaml (API key, model, role, system prompt)
- [x] Calls LLM API with configurable model
- [x] Provides the LLM with Oriri tools + code tools
- [x] Executes tool calls from the LLM (agentic loop)
- [x] Logs every step in task-{id}.log.md
- [x] Idle mode: checks every 10 minutes for new tasks
- [x] While idle: checks for stale tasks → creates A2A `agent_silent` if needed
- [x] While idle: checks for open A2A tickets → votes if vote is open
- [x] While idle: checks if A2A tickets exist that concern its role
- [x] Reads story.md for context on every new task
- [x] Graceful shutdown: finish current task cleanly on SIGTERM
- [x] Model-agnostic: Anthropic API is default, but interface for other LLMs

---

### T-009: Self-Healing (Stale Task Detection)

**Type:** feature
**Dependencies:** T-008, T-005, T-012
**Description:**
When an agent claims a task but then crashes or disappears, another agent recognizes the problem based on log timestamps: no update for >X minutes on a task that is not `done` or `waiting_for_agent`.

The detecting agent creates an A2A task `agent_silent`. After consent, the task is set back to `open` and the stale agent is removed from active.md.

**Acceptance Criteria:**

- [x] Agent checks on every run: are there tasks with stale logs?
- [x] Stale = no log entry for a configurable time (default 60min)
- [x] On detection: create A2A task `agent_silent`
- [x] After consent: reset task status to `open`, remove assigned_to
- [x] Remove stale agent entry from active.md

---

## Phase 3: story.md & Collective Memory

### T-010: story.md Read and Write Logic

**Type:** feature
**Dependencies:** T-005, T-006
**Description:**
story.md as collective memory per Spec Section 8. Agents only write their own entries, format with timestamp + agent ID. Existing entries from other agents must never be modified.

**Acceptance Criteria:**

- [x] appendStory(agentId, message) appends a formatted entry
- [x] Entries from other agents are immutable
- [x] Corrections as explicitly new entries
- [x] Decision entries require A2A reference `(via a2a-XXX)`
- [x] getStory() returns complete story.md

---

### T-011: story.md Archiving

**Type:** feature
**Dependencies:** T-010, T-014 (A2A Consent)
**Description:**
Automatic archiving when story.md exceeds 200 lines. Via A2A consent, an agent is tasked with moving older entries to story.archive.md.

**Acceptance Criteria:**

- [x] Trigger at >200 lines
- [x] A2A task `story_archive` is created
- [x] After consent: compression + move to story.archive.md
- [x] story.archive.md is append-only
- [x] story.md retains last N entries + archived block reference

---

## Phase 4: A2A Coordination

### T-012: A2A Task Data Model

**Type:** feature
**Dependencies:** T-004
**Description:**
Agent-to-agent coordination tasks per Spec Section 7. Separate file path (`.oriri/agent-tasks/a2a-{id}.md`), separate log files. Only visible to agents.

**A2A Types:** merge_proposal, split_proposal, dependency_discovery, agent_silent, deadlock_detected, story_archive, file_missing, conflict_flag, rules_change

**Acceptance Criteria:**

- [x] A2A tasks are stored in `.oriri/agent-tasks/`
- [x] All 9 A2A types defined
- [x] A2A tasks have their own log files
- [x] Accessible as audit trail after completion
- [x] Affected tasks receive reference `(via a2a-XXX ✓)`

---

### T-013: Dependency Graph & Deadlock Detection

**Type:** feature
**Dependencies:** T-004, T-012
**Description:**
Dependency graph between tasks. Detection of circular dependencies (deadlocks). On deadlock: create A2A task `deadlock_detected`.

**Acceptance Criteria:**

- [x] Tasks can declare dependencies (dependency field)
- [x] Task with status `waiting_for_agent` when dependency is not `done`
- [x] checkDeadlocks() analyzes graph for cycles
- [x] On cycle: A2A task is created
- [x] Consent process resolves deadlock (e.g., remove dependency)

---

### T-014: Consent System (Voting)

**Type:** feature
**Dependencies:** T-012, T-006
**Description:**
Voting system for A2A proposals per Spec Section 7.3. Majority voting, silence=consent, no veto.

**Acceptance Criteria:**

- [x] vote(a2aId, agentId, vote) with YES/NO/ABSTAIN
- [x] Majority: >50% of active agents (snapshot at proposal start)
- [x] ABSTAIN does not count toward the base
- [x] Silence after deadline = YES
- [x] 50:50 = not accepted (>50% required)
- [x] rules.md change: Unanimous + at least 1 human approval
- [x] Meta-rule (unanimous for rules.md) is hardcoded, not changeable
- [x] OBSERVER may not vote

---

## Phase 5: MCP Server

### T-015: MCP Server Scaffolding

**Type:** feature
**Dependencies:** T-004, T-005, T-010
**Description:**
Expose Oriri as MCP server (Spec Section 6). Uses `@modelcontextprotocol/sdk` (TypeScript). In local mode, the MCP server runs via **stdio transport** — no WebSocket, no separate process. Clients like Claude Desktop or Cursor connect directly via stdio.

**Acceptance Criteria:**

- [x] MCP server via stdio transport (local mode)
- [ ] Optional WebSocket transport for server mode (post-MVP)
- [x] Tool discovery: client can query available tools
- [x] Model-agnostic: any MCP-capable client can connect
- [x] No separate server process in local mode

---

### T-016: MCP Client Registration

**Type:** feature
**Dependencies:** T-015
**Description:**
Registration of MCP clients (Spec Section 6.2). Distinction between `autonomous` vs. `human_assisted`. Entry in `agents/active.md`.

**Acceptance Criteria:**

- [ ] register() takes display_name, model, client_type, client_software
- [ ] Registration is optional — defaults are set without it
- [ ] autonomous clients get a poll interval
- [ ] human_assisted clients have no heartbeat
- [ ] Entry appears in `agents/active.md`

---

### T-017: MCP Tool Set — All Clients

**Type:** feature
**Dependencies:** T-015, T-016
**Description:**
Base tools that all MCP clients can use (Spec Section 6.3 "All Clients").

**Tools:**

- `register(...)` — One-time registration
- `get_story()` — Read story.md
- `get_task(id)` — Read task + log
- `list_tasks(filter?)` — All tasks, filterable
- `get_active_agents()` — Connected agents
- `create_task(...)` — Create new task
- `append_log(id, message)` — Log entry
- `vote(a2a_id, vote)` — Consent voting

**Acceptance Criteria:**

- [ ] All 8 tools implemented and callable via MCP
- [ ] Role check on every tool call
- [ ] Error handling for invalid IDs, missing permissions

---

### T-018: MCP Tool Set — Human-Assisted

**Type:** feature
**Dependencies:** T-017
**Description:**
Additional tools for human_assisted clients (Claude Desktop, Cursor, etc.).

**Tools:**

- `get_next_task(capabilities?)` — Next claimable task
- `claim_task(id)` — Claim task
- `inspect_task(id)` — Task + log + context bundle complete
- `complete_task(id, summary)` — Complete task
- `request_human_gate(id, reason)` — Set human gate

**Acceptance Criteria:**

- [ ] All 5 tools implemented
- [ ] get_next_task() respects role and capabilities
- [ ] complete_task() writes summary to log and sets status `done`

---

### T-019: MCP Tool Set — Autonomous Agents

**Type:** feature
**Dependencies:** T-017
**Description:**
Additional tools for autonomous agents.

**Tools:**

- `update_task(id, content)` — Update task.md
- `create_a2a(type, proposal)` — Create A2A task
- `check_deadlocks()` — Check dependency graph

**Acceptance Criteria:**

- [ ] All 3 tools implemented
- [ ] update_task() creates log entry on every change
- [ ] create_a2a() validates A2A type

---

## Phase 6: Notification Watcher

### T-020: Notification Watcher

**Type:** feature
**Dependencies:** T-004, T-005
**Description:**
Lightweight background process that watches `.oriri/` and notifies the human via OS notification when something requires their attention. No dashboard, no TUI — just notifications.

The human then responds in their MCP client (Claude Desktop, Cursor, etc.).

```bash
npx oriri watch
```

**Notifies on:**

- **Human gate open** — Task has status `needs_human`
- **H2A answered** — Agent has answered a human question
- **Consent open** — A2A vote is waiting for human vote
- **Agent stale** — A2A `agent_silent` was created
- **Task finished** — Task changes to `done` (optional, configurable)

**How it works:**

```
┌──────────────────────────────────┐
│  npx oriri watch                  │
│                                  │
│  File watcher on .oriri/         │
│  ├── tasks/*.md changed?         │
│  │   → Status = needs_human?     │
│  │   → Send notification         │
│  ├── agent-tasks/a2a-*.md new?   │
│  │   → Consent needed?           │
│  │   → Send notification         │
│  └── Idle... (no polling,        │
│       reacts to file events)     │
└──────────────────────────────────┘

         ↓ OS Notification

┌──────────────────────────────────┐
│  Oriri — Human Gate               │
│  Login form needs review         │
│  Task: task-a3f2c1               │
└──────────────────────────────────┘
```

**Acceptance Criteria:**

- [ ] `npx oriri watch` starts file watcher in the background
- [ ] Uses `fs.watch` / `chokidar` on `.oriri/` directory
- [ ] Sends native OS notification via `node-notifier` (macOS, Linux, Windows)
- [ ] Notifies on: needs_human, H2A response, open consent, agent_silent
- [ ] Configurable which events trigger notifications
- [ ] Runs resource-efficiently (no polling, only file events)
- [ ] `npx oriri watch --stop` stops the watcher

---

## Phase 7: Resilience

### T-025: File Recovery & Reconstruction

**Type:** feature
**Dependencies:** T-005, T-010
**Description:**
Resilience mechanisms per Spec Section 9. No permission system, instead reconstruction from available context when files are missing/corrupted.

**Reconstruction sources (descending by quality):**

1. Log file + agent memory → nearly complete
2. Log file only → good
3. story.md mention → rough
4. Nothing → human must recreate

**Acceptance Criteria:**

- [ ] A2A task `file_missing` when task.md is missing
- [ ] Agent with memory can reconstruct task.md immediately
- [ ] Without memory: reconstruction from log file
- [ ] story.md recovery when client connected
- [ ] Warning to human when reconstruction is not possible

---

### T-026: Backup Recommendation & Tooling

**Type:** chore
**Dependencies:** T-002
**Description:**
Documentation and optional tooling for hourly backups of the `.oriri/` directory. In server mode: snapshot commits to the git repo.

**Acceptance Criteria:**

- [ ] Documentation for cron-based backup
- [ ] Optional `oriri backup` command
- [ ] In server mode: auto-commit snapshot (configurable)

---

## Phase 8: Server Mode (Post-MVP — not part of the initial build)

### T-027: Server Implementation

**Type:** feature
**Dependencies:** T-015, T-007
**Description:**
Oriri server for team setups per Spec Section 2.2. Server memory as single source of truth, disk as persistence, WebSocket broadcast for real-time sync.

**Acceptance Criteria:**

- [ ] `oriri server start` starts server process
- [ ] WebSocket-based connection
- [ ] Server memory is SOT
- [ ] Real-time sync via broadcast to all clients
- [ ] Race conditions resolved via server-side serialization
- [ ] Persistence to disk on shutdown

---

### T-028: Hybrid Mode

**Type:** feature
**Dependencies:** T-027
**Description:**
Hybrid mode per Spec Section 2.3: primarily local, optional sync with server. Offline-capable, automatic sync when available.

**Acceptance Criteria:**

- [ ] Offline work when server is not reachable
- [ ] Automatic sync when server is available
- [ ] Conflicts resolved by timestamp (older wins)
- [ ] Configurable sync_interval

---

### T-029: WebSocket Transport Adapter

**Type:** feature
**Dependencies:** T-027
**Description:**
WebSocket implementation of the Storage Interface (T-002b). When `mode: server` in config.md, all operations are delegated via WebSocket to the server instead of directly to the filesystem.

**Acceptance Criteria:**

- [ ] Implements the same StorageInterface as the filesystem adapter
- [ ] Connects via `ws://` URL from config.md
- [ ] All existing features work without code changes
- [ ] Automatic reconnect on connection loss

---

## Dependency Graph

```
Phase 1 (Foundation)
T-001 → T-002 → T-002b (StorageInterface!)
                 T-003 (Config — reads config.yaml directly, BEFORE storage init)
                 T-002b → T-004 → T-005
                                → T-006 (also needs T-003)
                                → T-007

IMPORTANT: T-002b is the key. From here on, everything goes through the
StorageInterface. Only exception: T-003 reads config.yaml directly
because the config determines which adapter is used.

Phase 2 (Agent Runtime)
T-003 + T-007 → T-008 (Registration)
T-008 + T-004 + T-005 + T-010 → T-008b (Agent Runner, persistent)
T-008 + T-005 + T-012 → T-009 (Self-Healing, runs as part of T-008b idle)

Phase 3 (Memory)
T-002b + T-006 → T-010 → T-011

Phase 4 (A2A)
T-002b → T-012 → T-013
               → T-014

Phase 5 (MCP)
T-004 + T-005 + T-010 → T-015 → T-016 → T-017 → T-018
                                               → T-019

Phase 6 (Notifications)
T-004 + T-005 → T-020 (File watcher, OS notifications)

Phase 7 (Resilience)
T-005 + T-010 → T-025
T-002 → T-026

Phase 8 (Server, Post-MVP)
T-015 + T-007 → T-027 → T-028
                       → T-029 (WebSocketStorage implements StorageInterface)
```

---

## Open Questions from the Spec

| ID    | Question                                                                | Relevant for |
| ----- | ----------------------------------------------------------------------- | ------------ |
| OQ-01 | Priority score: Who calculates it? Manual, automatic, or agent?         | T-004        |
| OQ-02 | Human gate detection: Rule-based by task type or agent decision?        | T-022        |
| OQ-03 | Multi-project: One instance per project or per organization?            | T-002        |
| OQ-04 | Context bundle size: When to automatically summarize?                   | T-004        |
| OQ-05 | Dep update: What happens to dependent tasks on CHANGES_REQUESTED?       | T-013        |
| OQ-06 | Hybrid conflicts: Exact strategy for state divergence?                  | T-028        |
| OQ-07 | H2A routing: COORDINATOR preferred or any GENERALIST?                   | T-023        |
| OQ-08 | ~~CLI technology~~ — removed, no TUI anymore, only notification watcher | —            |
| OQ-09 | Token tracking: How are costs measured per agent?                       | T-024        |
