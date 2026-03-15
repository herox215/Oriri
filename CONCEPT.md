# Oriri — AI-First Ticketing System

## Problem

Existing ticketing systems (Jira, Linear, etc.) are built for humans. AI agents have to adapt to these systems via MCP adapters — that's like hitching a horse to a car.

Oriri flips this around: A ticketing system that is primarily designed for AI agents, with a human interface as a secondary layer.

---

## Why not Jira + MCP?

### Structural Mismatch

- **Data model for humans**: Story Points, Sprints, Boards, Epics — all UI concepts that an AI agent doesn't need.
- **Free-text context**: Descriptions, comments, attachments — an agent has to gather and parse everything.
- **No context budget**: Jira doesn't know how much context an agent can process. Tickets are often too large or too vague.
- **No verification**: "Done" is a manual column change, not an automatic validation.

### Technical Problems

- **Latency**: Jira API is slow, MCP adds another layer of indirection.
- **Rate Limits**: Quickly reached with many parallel agents.
- **Cost**: Jira licenses per seat + MCP server operation.
- **Vendor Lock-in**: Atlassian ecosystem with its own rules.

---

## Core Ideas

### 1. Structured Context Instead of Free Text

Each ticket contains machine-readable context:

```yaml
ticket:
  id: OR-42
  title: "Rate Limiting fuer /api/users Endpoint"
  context:
    files:
      - src/api/users.ts
      - src/middleware/rateLimit.ts
    dependencies:
      - OR-39  # Redis-Integration
    codebase_refs:
      - function: handleUserRequest
        file: src/api/users.ts
        line: 45
  acceptance_criteria:
    - type: test
      command: "npm test -- --grep 'rate limit'"
    - type: assertion
      check: "GET /api/users returns 429 after 100 requests/min"
  constraints:
    max_context_tokens: 80000
    estimated_complexity: medium
```

No free-text parsing needed. The agent immediately knows what to do, which files are relevant, and what success looks like.

### 2. Automatic Decomposition

A large feature ticket is automatically broken down into sub-tasks that:

- **Fit into a context window** — the system knows the token limits of the agents.
- **Are individually verifiable** — each sub-task has its own acceptance criteria.
- **Have clear dependencies** — DAG instead of a flat list.

```
OR-100: "User Authentication"
  ├── OR-101: "JWT Token Generation" (no dependencies)
  ├── OR-102: "Login Endpoint" (depends on OR-101)
  ├── OR-103: "Token Refresh" (depends on OR-101)
  └── OR-104: "Logout & Token Invalidation" (depends on OR-102, OR-103)
```

### 3. Validation & Confidence Levels

Not every validation is equally valuable. Oriri models this explicitly via a **confidence system**:

#### Validation Levels

| Level | Validated by | Confidence | Example |
|---|---|---|---|
| **automated** | Tests, Linter, CI | Baseline | Unit tests green, no lint errors |
| **agent-reviewed** | Second AI agent | Medium | Code review by a review agent |
| **human-verified** | Human | High | Developer has tested and approved |
| **human-approved** | Stakeholder/PO | Highest | Product owner has approved the feature |

The more human validation, the higher the confidence. A ticket validated only by automated tests carries less weight than one approved by a human.

#### Why Human Validation Is More Valuable

- **UI/UX**: No automated test can judge whether something feels right, is intuitive, or is aesthetically correct. UI tickets always require human validation.
- **Business logic**: Automated tests check whether code runs correctly — humans check whether the right thing was built.
- **Edge cases**: Humans spot problems that no test covers ("It works, but what happens when the user...").
- **Trust**: A human-validated ticket gives the team more confidence than a purely automatically closed one.

#### Ticket Configuration

```yaml
validation:
  # Automatically verifiable criteria
  automated:
    - type: test
      command: "npm test -- --grep 'rate limit'"
    - type: lint
      command: "npm run lint"

  # Human validation — required or optional
  human:
    required: true
    type: visual_review    # visual_review | functional_review | stakeholder_approval
    prompt: "Check whether the login form is displayed correctly"
    assigned_to: null      # Can be assigned to a specific person

  # Minimum confidence for completion
  min_confidence: human-verified
```

#### Confidence Affects the Overall Process

- **Deployment gates**: Only tickets with `human-verified` or higher may go to production.
- **Metrics**: The system tracks the ratio of automatically vs. human-validated tickets — too few human reviews is a warning signal.
- **Ticket priority**: Human-validated tickets have higher priority for merging and release planning.

#### Categories That Always Require Human Validation

- **UI/Frontend changes**: Visuals, layout, animations, UX flows
- **Text & copy**: Wording, tone, spelling in context
- **New features**: First release of a feature should always be tested by a human
- **Security-relevant changes**: Auth, permissions, data access

### 4. Dual Effort Estimation (AI + Human)

Effort estimation works like planning poker — both sides estimate independently, without seeing the other side's estimate. Only after both have estimated are the values revealed.

#### Process

```
1. Ticket is created
2. AI analyzes and submits its estimate (automatically)
3. Human submits their estimate (without seeing the AI estimate)
4. Both estimates are revealed
5. In case of large deviation: Discussion / clarification
```

#### Why Blind Estimation?

- **No anchoring**: The human should not be anchored by the AI estimate — and vice versa.
- **Deviations are valuable**: When AI says "2h" and the human says "2 days", one side is missing context. That's a signal, not a bug.
- **Calibration**: Over time, the system learns where AI and human systematically deviate and can factor that in.

#### Estimation Dimensions

AI and human don't just estimate "how long", but along multiple axes:

```yaml
estimation:
  ai:
    locked: true           # Only visible after human estimation
    effort: "2h"           # Estimated working time
    complexity: medium     # low | medium | high | critical
    risk: low              # Risk of unexpected problems
    context_needed: 12000  # Tokens of context the agent needs
    confidence: 0.85       # How confident the AI is in this estimate
    reasoning: |
      Clear requirement, affected files are manageable.
      Rate-limiting pattern already exists in the codebase.

  human:
    locked: true           # Only visible after AI estimation
    effort: "4h"
    complexity: medium
    risk: medium
    reasoning: |
      Fundamentally doable, but we need to be careful
      that the Redis connection stays stable under load.

  # Automatically calculated after reveal
  comparison:
    effort_delta: "+2h"    # Human estimates higher
    risk_delta: "+1"       # Human sees more risk
    needs_discussion: true # Deviation above threshold
    insight: |
      Human sees infrastructure risk (Redis under load)
      that the AI didn't consider.
```

#### What Happens with Deviations?

| Deviation | Interpretation | Action |
|---|---|---|
| AI >> Human | AI sees technical complexity the human isn't aware of | AI explains its concerns |
| Human >> AI | Human has domain knowledge / experience the AI lacks | Context is added to the ticket |
| Both similar | Good shared understanding | Ticket can start |
| Both uncertain | Ticket is poorly defined | Ticket needs refinement |

#### Calibration Over Time

The system tracks:

- **Estimation accuracy**: How close were AI and human estimates to the actual effort?
- **Systematic deviations**: Does the AI underestimate certain ticket types? Does the human overestimate frontend effort?
- **Learning effect**: AI estimates improve because the system learns from past deviations.

```
Calibration Report:
  AI accuracy (last 30 tickets): 72%
  Human accuracy (last 30 tickets): 68%
  AI systematically underestimates: Security tickets (+40%)
  Human systematically overestimates: Refactoring tickets (+25%)
```

### 5. Context Budget Management

The system knows:

- How much context an agent can process at most
- Which files are relevant for a ticket (and how large they are)
- Whether a ticket fits into a single agent session or needs to be split

```
Ticket OR-42:
  Relevant context: ~12,000 tokens
  Agent limit: 80,000 tokens
  Status: Fits in one session ✓
```

### 5. Dependency Graph as a First-Class Concept

Not "linked issues" as an afterthought, but a real DAG:

- **Blocked by**: Agent doesn't start until the dependency is resolved.
- **Parallelizable**: System automatically identifies which tickets can be worked on simultaneously.
- **Critical path**: Which tickets need to be completed first to avoid blocking overall progress?

### 6. Feedback Loop & Learning Capability

When an agent fails on a ticket, the system captures:

- **Why?** — Unclear description? Missing context? Contradictory criteria?
- **What helped?** — What additional information did the agent need?
- **Patterns**: Do certain error types repeat?

This knowledge flows back into ticket creation: Better templates, automatic context enrichment, warnings for unclear requirements.

### 7. Multi-Agent Orchestration

- **Assignment**: Which agent type is best suited for which ticket? (Code agent, test agent, review agent)
- **Parallelization**: Work on independent tickets simultaneously.
- **Handoffs**: Agent A writes code → Agent B reviews → Agent C writes tests.
- **Conflict detection**: Two agents working on overlapping files? System detects this and serializes.

### 8. Tickets as Code

Tickets live in the repository, not in an external database:

```
.oriri/
  tickets/
    OR-042.yaml
    OR-043.yaml
  graphs/
    sprint-2024-03.yaml
  history/
    OR-042.log
```

Benefits:

- **Versioned**: Git-tracked, diffable, reviewable.
- **Reproducible**: Ticket state is always consistent with the code.
- **Offline-capable**: No external service needed.
- **No vendor lock-in**: Plain YAML/JSON files.

---

## Human Interface: Tasks Instead of Tickets

The human doesn't see tickets, no YAML structures, no DAGs. They see **tasks** — simple, clear calls to action. The internal ticket structure is an implementation detail that only the AI cares about.

### Philosophy

The human is not a ticket manager. They are a decision-maker, reviewer, and knowledge source. The interface reflects this:

- **No boards, no columns, no sprints** — those are organizational concepts for humans managing work. Here, the AI manages.
- **No ticket IDs, no fields, no workflows** — the human doesn't need to know that OR-042.yaml exists internally.
- **Instead: A task list** — sorted by urgency, filtered by what the human can do.

### What the Human Sees

A simple, prioritized list of tasks that need their attention:

```
┌─────────────────────────────────────────────────────┐
│  Oriri                            3 tasks           │
│─────────────────────────────────────────────────────│
│                                                     │
│  ⬤  Visually review login form                      │
│     AI has redesigned the login form.                │
│     → Does the layout look correct?                 │
│     [Looks good ✓]  [Changes needed ✎]              │
│                                                     │
│  ⬤  Estimate effort: Password reset feature         │
│     AI estimate: pending (waiting for you)           │
│     → How much effort is this?                       │
│     [Easy]  [Medium]  [Complex]  [Unclear]          │
│                                                     │
│  ⬤  Decision: Redis or Memcached?                   │
│     AI needs an architecture decision.               │
│     → Which cache layer should we use?               │
│     [Reply ✎]                                       │
│                                                     │
│  ── Completed today ──────────────────────────────  │
│  ✓  API rate limiting reviewed (2h ago)              │
│  ✓  Effort estimated: User export (4h ago)           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Task Types for Humans

The human only receives tasks that actually require a human:

| Type | When | Example |
|---|---|---|
| **Visual review** | UI change completed | "Does the new header look right?" |
| **Functional testing** | Feature implemented | "Does the checkout flow work?" |
| **Effort estimation** | New ticket, AI waiting | "How complex is this?" |
| **Decision making** | AI needs input | "SQL or NoSQL for this use case?" |
| **Provide context** | AI lacks knowledge | "How does the legacy import work?" |
| **Approval** | Feature release-ready | "Can this go live?" |

### What the Human Does NOT See

- Ticket internals (YAML, IDs, DAGs, dependencies)
- Purely technical tickets (refactoring, test fixes, dependency updates)
- Agent assignments and orchestration
- Context budget calculations
- Tickets that only need automated validation

### Notifications Instead of a Dashboard

The human doesn't need to open a dashboard. Tasks come to them:

- **Slack/Teams**: "Login form is done — can you take a quick look?"
- **CLI**: `oriri tasks` shows open tasks
- **Email digest**: Daily summary if desired
- **IDE integration**: Tasks as a sidebar in VS Code / Cursor

### Feedback Is Simple

Instead of writing comments in tickets:

```
AI:  "Does the new header look right?"

Human: "Yes, looks good."
-> Ticket is closed as human-verified.

Human: "No, the spacing at the top is too large."
-> AI receives feedback, automatically creates a follow-up,
   works in the change, asks again.
```

The human gives natural language feedback. The system takes care of the rest.

---

## Differentiation

| Aspect | Jira + MCP | Oriri |
|---|---|---|
| Primary interface | Human (Web UI) | AI agent (internal) + Human (task list) |
| Data model | Human workflows | Machine-readable context |
| Ticket size | Arbitrary | Context-budget-aware |
| Verification | Manual | Confidence levels (auto -> human) |
| Dependencies | Linked Issues | DAG with scheduling |
| Storage | Cloud database | Repository (Git-tracked) |
| Feedback | Retrospectives | Automatic analysis |
| Multi-agent | Not supported | Orchestration built-in |

---

## Target Audience

1. **Teams using AI agents for development** — Claude Code, Cursor, Copilot Workspace, etc.
2. **Companies with multi-agent setups** — Multiple agents working in parallel on a codebase.
3. **Solo developers with AI support** — One person directs, AI agents execute.

---

## Open Questions

- How does Oriri integrate into existing CI/CD pipelines?
- Should there be a central server or is it purely local/repo-based?
- How is prioritization handled — human-driven or AI-assisted?
- Licensing model: Open Source? Commercial? Hybrid?
