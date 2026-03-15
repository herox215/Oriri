# Oriri Implementation Tickets

Tickets abgeleitet aus Oriri-Spec-v3-1. Sortiert nach Abhaengigkeiten — fruehe Tickets sind Grundlage fuer spaetere.

---

## Phase 1: Fundament

### T-001: Projekt-Scaffolding & Toolchain

**Typ:** chore
**Abhaengigkeiten:** keine
**Beschreibung:**
Projekt initialisieren als TypeScript/Node.js npm-Paket. Build-Tooling, Linter, Test-Framework, TypeScript-Konfiguration.

**Stack:**
- TypeScript + Node.js
- Package-Manager: pnpm oder npm
- Build: tsup oder tsx
- Test: vitest
- Linter: eslint + prettier
- CLI: als `bin`-Eintrag in package.json (`npx oriri`)

**Akzeptanzkriterien:**
- [ ] npm-Paket Struktur mit package.json, tsconfig.json
- [ ] TypeScript kompiliert fehlerfrei
- [ ] eslint + prettier eingerichtet
- [ ] vitest laeuft (leerer Test-Run)
- [ ] `npx oriri` fuehrt CLI-Einstiegspunkt aus
- [ ] CI-Pipeline fuer Tests (optional, lokal reicht fuer MVP)

---

### T-002: Filesystem-Struktur & Init-Command

**Typ:** feature
**Abhaengigkeiten:** T-001
**Beschreibung:**
`oriri init` Command implementieren, das die `.oriri/` Verzeichnisstruktur anlegt (Spec Abschnitt 3). Erstellt alle sieben Dateitypen mit sinnvollen Defaults.

**Betroffene Dateien (zu erzeugen):**
```
.oriri/
  config.yaml        ← einzige nicht-Markdown Datei (YAML fuer maschinelles Parsen)
  story.md
  story.archive.md
  rules.md
  agents/active.md
  tasks/             (leeres Verzeichnis)
  agent-tasks/       (leeres Verzeichnis)
```

**Akzeptanzkriterien:**
- [ ] `npx oriri init` erstellt komplette Struktur
- [ ] config.yaml hat Default `mode: local`
- [ ] story.md ist leer mit Header
- [ ] rules.md enthaelt Default-Consent-Regeln (Majority >50%)
- [ ] Doppeltes `init` ueberschreibt nichts / warnt
- [ ] Fehlermeldung wenn `.oriri/` bereits existiert (mit `--force` Flag)

---

### T-002b: Storage-Interface (Abstraktionsschicht)

**Typ:** feature
**Abhaengigkeiten:** T-002
**Beschreibung:**
Alle Datei-Operationen laufen ueber ein abstraktes `StorageInterface`. Im MVP gibt es nur eine Implementierung: `FilesystemStorage` (liest/schreibt direkt in `.oriri/`). Spaeter kann ein `WebSocketStorage` dazukommen — ohne dass irgendein anderer Code sich aendern muss.

Das ist die Grundlage dafuer, dass wir spaeter einfach sagen koennen: "Connecte dich mit dieser Instanz per WebSocket" — und alles funktioniert weiter.

**Hinweis:** Config-Lesen (`config.yaml`) passiert *vor* der Storage-Initialisierung — die Config bestimmt welcher Adapter genutzt wird. Config-Lesen ist die einzige Operation die direkt aufs Filesystem zugreift.

```typescript
interface StorageInterface {
  // Tasks
  readTask(id: string): Promise<string>       // Gibt Markdown zurueck
  writeTask(id: string, content: string): Promise<void>
  listTasks(): Promise<string[]>              // Liste von Task-IDs
  deleteTask(id: string): Promise<void>

  // Logs (append-only)
  appendLog(taskId: string, line: string): Promise<void>
  readLog(taskId: string): Promise<string>

  // Story
  readStory(): Promise<string>
  appendStory(line: string): Promise<void>

  // A2A
  readA2A(id: string): Promise<string>
  writeA2A(id: string, content: string): Promise<void>
  listA2A(): Promise<string[]>

  // Agents
  readActiveAgents(): Promise<string>
  writeActiveAgents(content: string): Promise<void>
}
```

**Akzeptanzkriterien:**
- [ ] `StorageInterface` als TypeScript Interface definiert
- [ ] `FilesystemStorage` implementiert alle Methoden
- [ ] Alle anderen Module nutzen nur das Interface, nie direkt `fs.*`
- [ ] Storage-Implementierung wird per Config gewaehlt (`mode: local` → Filesystem)
- [ ] Interface arbeitet mit rohen Strings (Markdown) — keine strukturierten Objekte, die AI interpretiert den Inhalt
- [ ] Interface ist so geschnitten dass ein WebSocket-Adapter spaeter reinpasst ohne Aenderungen am Rest

---

### T-003: Config-Loader

**Typ:** feature
**Abhaengigkeiten:** T-002
**Beschreibung:**
`.oriri/config.yaml` laden. Einzige Datei die direkt vom Filesystem gelesen wird (vor Storage-Initialisierung), weil die Config bestimmt welcher Storage-Adapter genutzt wird.

**Akzeptanzkriterien:**
- [ ] Liest `.oriri/config.yaml` (YAML, nicht Markdown)
- [ ] Parst `mode: local` (MVP), spaeter `server | hybrid`
- [ ] Parst Agent-Definitionen (id, display_name, model, role, capabilities)
- [ ] Loest `${ENV_VAR}` aus Umgebungsvariablen auf
- [ ] Validierung: Fehler bei unbekannten Rollen, fehlenden Pflichtfeldern
- [ ] Gibt typisiertes Config-Objekt zurueck
- [ ] Config bestimmt welcher StorageInterface-Adapter instanziiert wird

---

### T-004: Task-Datenmodell & CRUD

**Typ:** feature
**Abhaengigkeiten:** T-002b
**Beschreibung:**
Task-Datenmodell nach Spec Abschnitt 5 implementieren. Tasks als Markdown-Dateien unter `.oriri/tasks/`. Umfasst Lesen, Schreiben, Auflisten, Status-Updates. Alle Operationen gehen ueber das StorageInterface.

Tasks sind Markdown-Dateien die von der AI interpretiert werden — kein striktes Schema-Parsing noetig. Ein Task der lange kein Log-Update hat ist implizit "orphaned" — das ist kein eigener Status sondern ein abgeleiteter Zustand den ein Agent erkennt.

**Task-Felder (als Markdown):**
- id (8-Hex Hash aus created_by + timestamp + title)
- title, type (feature/bug/chore/escalation)
- status (open, planning, executing, waiting_for_tool, waiting_for_agent, needs_human, awaiting_review, done)
- assigned_to, created_by, created_at
- context_bundle, dependencies
- auto_human_gate (ja/nein nach Typ)

**Akzeptanzkriterien:**
- [ ] Task-ID Generierung per Hash, Kollisionserkennung
- [ ] task-{id}.md schreiben und lesen ueber StorageInterface
- [ ] Status-Uebergang erstellt automatisch Log-Eintrag
- [ ] listTasks() gibt alle Task-IDs zurueck
- [ ] Auto-Human-Gate wird bei feature/bug automatisch gesetzt
- [ ] Kein `orphaned` Status — wird abgeleitet aus Log-Timestamps

---

### T-005: Append-Only Log-System

**Typ:** feature
**Abhaengigkeiten:** T-002b, T-004
**Beschreibung:**
Log-Dateien (`task-{id}.log.md`) als append-only chronologisches Protokoll. Jeder Status-Wechsel, jede Agent-Aktion wird geloggt. Logs ueberleben Task-Loeschung.

**Format:**
```markdown
[2026-03-15 14:30:00] agent-alpha | status: open → planning
[2026-03-15 14:30:05] agent-alpha | Analysiere Abhängigkeiten...
[2026-03-15 14:32:00] agent-alpha | status: planning → executing
```

**Akzeptanzkriterien:**
- [ ] appendLog(taskId, agentId, message) haengt Zeile an
- [ ] Timestamp wird automatisch gesetzt
- [ ] Log-Datei wird nie ueberschrieben, nur angehaengt
- [ ] Log existiert unabhaengig von task.md
- [ ] Log lesen: getLog(taskId) gibt alle Eintraege zurueck

---

## Phase 2: Agent-Runtime

### T-006: Agent-Rollen & Berechtigungen

**Typ:** feature
**Abhaengigkeiten:** T-003, T-004
**Beschreibung:**
Rollen-System nach Spec Abschnitt 4.2 implementieren. Sechs Rollen (GENERALIST, CODER, REVIEWER, COORDINATOR, ARCHITECT, OBSERVER) mit unterschiedlichen Rechten auf Tasks, A2A-Tasks und story.md.

**Akzeptanzkriterien:**
- [ ] Jede Rolle hat definierte Rechte (claim/lesen/kein Zugriff)
- [ ] CODER kann nur feature/bug/chore claimen
- [ ] REVIEWER sieht nur awaiting_review Tasks zum Claimen
- [ ] COORDINATOR claimed nur A2A Tasks
- [ ] OBSERVER ist read-only, kein Claimen
- [ ] Alle ausser OBSERVER koennen voten
- [ ] Rollen-Check bei jedem claimTask() / createA2A()

---

### T-007: Task-Claiming

**Typ:** feature
**Abhaengigkeiten:** T-004, T-006
**Beschreibung:**
Self-Assignment Mechanismus: Agent claimed Task indem er Status und assigned_to in der task.md setzt. Bei Race Conditions (zwei Agents schreiben gleichzeitig) gewinnt der erste Schreiber — der zweite erkennt beim naechsten Lesen dass der Task schon vergeben ist und sucht weiter.

Stale Claims (Agent stuerzt ab, Lock bleibt) werden nicht per Disconnect-Detection geloest, sondern per Self-Healing: Ein anderer Agent bemerkt dass das Log keine Updates mehr hat und erstellt einen A2A `agent_silent` Task (siehe T-009).

**Akzeptanzkriterien:**
- [ ] claimTask() setzt Status auf `planning` und `assigned_to` in task.md
- [ ] Rollen-Check vor dem Claimen
- [ ] Log-Eintrag bei erfolgreichem Claim
- [ ] Kein explizites Lock-Management — Self-Healing bei stale Claims

---

### T-008: Agent-Registrierung & Kontrolle

**Typ:** feature
**Abhaengigkeiten:** T-003, T-007
**Beschreibung:**
`agents/active.md` ist die zentrale Kontrolldatei fuer alle laufenden Agents. Sie dient gleichzeitig als Registry und als Kill-Switch:

- **Start:** Agent traegt sich ein
- **Laufend:** Agent prueft bei jedem Loop ob er noch drinsteht
- **Stoppen:** Mensch (oder anderer Agent) loescht die Zeile → Agent bemerkt das und faehrt sich sauber herunter

```markdown
# Active Agents

| ID            | Rolle       | Model             | PID   | Seit       |
|---------------|-------------|--------------------|-------|------------|
| agent-alpha   | CODER       | claude-sonnet-4-6  | 48291 | 2026-03-15 |
| agent-reviewer| REVIEWER    | claude-haiku-4-5   | 48305 | 2026-03-15 |
```

Der Mensch kann jederzeit diese Datei oeffnen und einen Agent entfernen. Kein CLI-Befehl noetig — die Datei ist das Interface.

Zusaetzlich gibt es Convenience-Befehle:

```bash
npx oriri agent-stop --agent-id agent-alpha    # Entfernt aus active.md
npx oriri agent-stop --all                     # Alle Agents stoppen
npx oriri agent-list                           # Zeigt active.md
```

**Akzeptanzkriterien:**
- [ ] Agent traegt sich bei Start in `agents/active.md` ein (ID, Rolle, Model, PID, Timestamp)
- [ ] Agent prueft bei jedem Loop-Durchlauf ob er noch in active.md steht
- [ ] Wenn Agent nicht mehr in active.md: aktuellen Task sauber beenden, dann Shutdown
- [ ] Graceful Shutdown per SIGTERM/SIGINT (traegt sich selbst aus)
- [ ] `npx oriri agent-stop --agent-id X` entfernt Agent aus active.md
- [ ] `npx oriri agent-stop --all` leert active.md
- [ ] `npx oriri agent-list` zeigt alle registrierten Agents
- [ ] Stale Eintraege werden per Self-Healing bereinigt (T-009)

---

### T-008b: Agent-Runner (LLM API Loop)

**Typ:** feature
**Abhaengigkeiten:** T-008, T-004, T-005, T-010
**Beschreibung:**
Langlebiger Agent-Prozess der dauerhaft laeuft und eigenstaendig Tasks abarbeitet. Der Agent-Runner ist eine Endlosschleife mit zwei Modi:

**Arbeitend:** Agent hat einen Task geclaimt und arbeitet ihn ab. Ruft die LLM API (z.B. Anthropic) auf, gibt dem Model die Oriri-Tools + Projekt-Dateien, fuehrt Tool-Calls aus bis der Task fertig ist.

**Idle:** Kein offener Task verfuegbar. Agent wartet und prueft alle 10 Minuten ob neue Tasks da sind. Waehrend er idlet, prueft er auch auf stale Tasks anderer Agents (Self-Healing).

```
npx oriri agent-start --agent-id agent-alpha
```

```
┌──────────────────────────────────────────────┐
│  Agent-Runner Loop                           │
│                                              │
│  while (true) {                              │
│    tasks = listTasks(open, meineRolle)        │
│                                              │
│    if (tasks.length > 0) {                   │
│      task = pickBestTask(tasks)               │
│      claimTask(task)                          │
│                                              │
│      // LLM API Loop                         │
│      while (task nicht fertig) {              │
│        response = anthropic.messages.create({ │
│          model: config.model,                 │
│          system: systemPrompt + story.md,     │
│          tools: oririTools + codeTools,        │
│          messages: taskContext                 │
│        })                                     │
│        executeToolCalls(response)             │
│        appendLog(task, fortschritt)           │
│      }                                        │
│                                              │
│      completeTask(task, summary)              │
│    } else {                                  │
│      // Idle — nichts zu tun, also Housekeeping │
│      checkForStaleTasks()   // Stale Logs?    │
│      checkOpenA2A()         // Offene Votes?  │
│      respondToA2A()         // Selber voten   │
│      sleep(10 min)                            │
│    }                                          │
│  }                                            │
└──────────────────────────────────────────────┘
```

**Tools die der Agent dem LLM gibt:**
- Oriri-Tools: list_tasks, claim_task, append_log, complete_task, get_story, create_a2a, vote
- Code-Tools: read_file, write_file, run_command, search_files
- Das LLM entscheidet selbst welche Tools es wann nutzt

**Akzeptanzkriterien:**
- [ ] `npx oriri agent-start --agent-id agent-alpha` startet dauerhaften Prozess
- [ ] Liest Agent-Config aus config.yaml (API Key, Model, Rolle, System-Prompt)
- [ ] Ruft LLM API auf mit konfigurierbarem Model
- [ ] Gibt dem LLM Oriri-Tools + Code-Tools
- [ ] Fuehrt Tool-Calls des LLM aus (Agentic Loop)
- [ ] Loggt jeden Schritt in task-{id}.log.md
- [ ] Idle-Modus: Prueft alle 10 Minuten auf neue Tasks
- [ ] Im Idle: Prueft auf stale Tasks → erstellt A2A `agent_silent` wenn noetig
- [ ] Im Idle: Prueft auf offene A2A Tickets → voted wenn Abstimmung offen
- [ ] Im Idle: Prueft ob A2A Tickets existieren die seine Rolle betreffen
- [ ] Liest story.md bei jedem neuen Task als Kontext
- [ ] Graceful Shutdown: Aktuellen Task sauber beenden bei SIGTERM
- [ ] Modell-agnostisch: Anthropic API ist Default, aber Interface fuer andere LLMs

---

### T-009: Self-Healing (Stale Task Detection)

**Typ:** feature
**Abhaengigkeiten:** T-008, T-005, T-012
**Beschreibung:**
Wenn ein Agent einen Task claimed aber dann abstuerzt oder verschwindet, erkennt ein anderer Agent das Problem anhand der Log-Timestamps: Kein Update seit >X Minuten bei einem Task der nicht `done` oder `waiting_for_agent` ist.

Der erkennende Agent erstellt einen A2A Task `agent_silent`. Nach Consent wird der Task zurueck auf `open` gesetzt und der stale Agent aus active.md entfernt.

**Akzeptanzkriterien:**
- [ ] Agent prueft bei jedem Run: gibt es Tasks mit stale Logs?
- [ ] Stale = kein Log-Eintrag seit konfigurierbarer Zeit (default 60min)
- [ ] Bei Fund: A2A Task `agent_silent` erstellen
- [ ] Nach Consent: Task-Status zurueck auf `open`, assigned_to entfernen
- [ ] Stale Agent-Eintrag aus active.md entfernen

---

## Phase 3: story.md & Kollektives Gedaechtnis

### T-010: story.md Lese- und Schreiblogik

**Typ:** feature
**Abhaengigkeiten:** T-005, T-006
**Beschreibung:**
story.md als kollektives Gedaechtnis nach Spec Abschnitt 8. Agents schreiben nur eigene Eintraege, Format mit Timestamp + Agent-ID. Bestehende Eintraege anderer Agents duerfen nie geaendert werden.

**Akzeptanzkriterien:**
- [ ] appendStory(agentId, message) haengt formatierten Eintrag an
- [ ] Eintraege anderer Agents sind immutable
- [ ] Korrekturen als explizit neue Eintraege
- [ ] Entscheidungs-Eintraege brauchen A2A-Referenz `(via a2a-XXX)`
- [ ] getStory() gibt komplette story.md zurueck

---

### T-011: story.md Archivierung

**Typ:** feature
**Abhaengigkeiten:** T-010, T-014 (A2A Consent)
**Beschreibung:**
Automatische Archivierung wenn story.md >200 Zeilen. Per A2A Consent wird ein Agent beauftragt, aeltere Eintraege nach story.archive.md zu verschieben.

**Akzeptanzkriterien:**
- [ ] Trigger bei >200 Zeilen
- [ ] A2A Task `story_archive` wird erstellt
- [ ] Nach Consent: Komprimierung + Verschiebung nach story.archive.md
- [ ] story.archive.md ist append-only
- [ ] story.md behaelt letzte N Eintraege + Archived-Block-Referenz

---

## Phase 4: A2A Koordination

### T-012: A2A Task-Datenmodell

**Typ:** feature
**Abhaengigkeiten:** T-004
**Beschreibung:**
Agent-to-Agent Koordinations-Tasks nach Spec Abschnitt 7. Eigener Dateipfad (`.oriri/agent-tasks/a2a-{id}.md`), eigene Log-Dateien. Nur fuer Agents sichtbar.

**A2A Typen:** merge_proposal, split_proposal, dependency_discovery, agent_silent, deadlock_detected, story_archive, file_missing, conflict_flag, rules_change

**Akzeptanzkriterien:**
- [ ] A2A Tasks werden in `.oriri/agent-tasks/` gespeichert
- [ ] Alle 9 A2A-Typen definiert
- [ ] A2A Tasks haben eigene Log-Dateien
- [ ] Nach Abschluss als Audit-Trail zugaenglich
- [ ] Betroffene Tasks erhalten Referenz `(via a2a-XXX ✓)`

---

### T-013: Dependency-Graph & Deadlock-Detection

**Typ:** feature
**Abhaengigkeiten:** T-004, T-012
**Beschreibung:**
Abhaengigkeitsgraph zwischen Tasks. Erkennung zirkulaerer Abhaengigkeiten (Deadlocks). Bei Deadlock: A2A Task `deadlock_detected` erstellen.

**Akzeptanzkriterien:**
- [ ] Tasks koennen Abhaengigkeiten deklarieren (dependency-Feld)
- [ ] Task mit Status `waiting_for_agent` wenn Abhaengigkeit nicht `done`
- [ ] checkDeadlocks() analysiert Graph auf Zyklen
- [ ] Bei Zyklus: A2A Task wird erstellt
- [ ] Consent-Verfahren loest Deadlock (z.B. Abhaengigkeit entfernen)

---

### T-014: Consent-System (Voting)

**Typ:** feature
**Abhaengigkeiten:** T-012, T-006
**Beschreibung:**
Abstimmungssystem fuer A2A-Proposals nach Spec Abschnitt 7.3. Majority-Voting, Silence=Consent, kein Veto.

**Akzeptanzkriterien:**
- [ ] vote(a2aId, agentId, vote) mit YES/NO/ABSTAIN
- [ ] Majority: >50% der aktiven Agents (Snapshot bei Proposal-Start)
- [ ] ABSTAIN zaehlt nicht zur Basis
- [ ] Silence nach Deadline = YES
- [ ] 50:50 = nicht angenommen (>50% noetig)
- [ ] rules.md Aenderung: Unanimous + mindestens 1 Human Approval
- [ ] Meta-Regel (Unanimous fuer rules.md) ist hardcoded, nicht aenderbar
- [ ] OBSERVER darf nicht voten

---

## Phase 5: MCP Server

### T-015: MCP Server Grundgeruest

**Typ:** feature
**Abhaengigkeiten:** T-004, T-005, T-010
**Beschreibung:**
Oriri als MCP Server exponieren (Spec Abschnitt 6). Verwendet `@modelcontextprotocol/sdk` (TypeScript). Im Lokal-Modus laeuft der MCP-Server per **stdio-Transport** — kein WebSocket, kein separater Prozess. Clients wie Claude Desktop oder Cursor verbinden sich direkt per stdio.

**Akzeptanzkriterien:**
- [ ] MCP Server per stdio-Transport (Lokal-Modus)
- [ ] Optionaler WebSocket-Transport fuer Server-Modus (Post-MVP)
- [ ] Tool-Discovery: Client kann verfuegbare Tools abfragen
- [ ] Modell-agnostisch: Jeder MCP-faehige Client kann sich verbinden
- [ ] Kein separater Server-Prozess im Lokal-Modus

---

### T-016: MCP Client-Registrierung

**Typ:** feature
**Abhaengigkeiten:** T-015
**Beschreibung:**
Registrierung von MCP-Clients (Spec Abschnitt 6.2). Unterscheidung `autonomous` vs. `human_assisted`. Eintrag in `agents/active.md`.

**Akzeptanzkriterien:**
- [ ] register() nimmt display_name, model, client_type, client_software
- [ ] Registrierung ist optional — ohne werden Defaults gesetzt
- [ ] autonomous Clients bekommen Poll-Intervall
- [ ] human_assisted Clients haben keinen Heartbeat
- [ ] Eintrag erscheint in `agents/active.md`

---

### T-017: MCP Tool-Set — Alle Clients

**Typ:** feature
**Abhaengigkeiten:** T-015, T-016
**Beschreibung:**
Basis-Tools die alle MCP-Clients nutzen koennen (Spec Abschnitt 6.3 "Alle Clients").

**Tools:**
- `register(...)` — Einmalige Registrierung
- `get_story()` — story.md lesen
- `get_task(id)` — Task + Log lesen
- `list_tasks(filter?)` — Alle Tasks, filterbar
- `get_active_agents()` — Verbundene Agents
- `create_task(...)` — Neuen Task anlegen
- `append_log(id, message)` — Log-Eintrag
- `vote(a2a_id, vote)` — Consent-Voting

**Akzeptanzkriterien:**
- [ ] Alle 8 Tools implementiert und per MCP aufrufbar
- [ ] Rollen-Check bei jedem Tool-Call
- [ ] Fehlerbehandlung bei ungueltigen IDs, fehlenden Rechten

---

### T-018: MCP Tool-Set — Human-Assisted

**Typ:** feature
**Abhaengigkeiten:** T-017
**Beschreibung:**
Zusaetzliche Tools fuer human_assisted Clients (Claude Desktop, Cursor, etc.).

**Tools:**
- `get_next_task(capabilities?)` — Naechster claimlbarer Task
- `claim_task(id)` — Task claimen
- `inspect_task(id)` — Task + Log + Context Bundle komplett
- `complete_task(id, summary)` — Task abschliessen
- `request_human_gate(id, reason)` — Human Gate setzen

**Akzeptanzkriterien:**
- [ ] Alle 5 Tools implementiert
- [ ] get_next_task() respektiert Rolle und Capabilities
- [ ] complete_task() schreibt Summary in Log und setzt Status `done`

---

### T-019: MCP Tool-Set — Autonome Agents

**Typ:** feature
**Abhaengigkeiten:** T-017
**Beschreibung:**
Zusaetzliche Tools fuer autonome Agents.

**Tools:**
- `update_task(id, content)` — task.md updaten
- `create_a2a(type, proposal)` — A2A Task erstellen
- `check_deadlocks()` — Dependency-Graph pruefen

**Akzeptanzkriterien:**
- [ ] Alle 3 Tools implementiert
- [ ] update_task() erstellt Log-Eintrag bei jeder Aenderung
- [ ] create_a2a() validiert A2A-Typ

---

## Phase 6: Notification Watcher

### T-020: Notification Watcher

**Typ:** feature
**Abhaengigkeiten:** T-004, T-005
**Beschreibung:**
Leichtgewichtiger Hintergrund-Prozess der `.oriri/` beobachtet und den Menschen per OS-Notification benachrichtigt wenn etwas seine Aufmerksamkeit braucht. Kein Dashboard, keine TUI — nur Notifications.

Der Mensch reagiert dann in seinem MCP-Client (Claude Desktop, Cursor, etc.).

```bash
npx oriri watch
```

**Benachrichtigt bei:**
- **Human Gate offen** — Task hat Status `needs_human`
- **H2A beantwortet** — Agent hat auf eine menschliche Frage geantwortet
- **Consent offen** — A2A Abstimmung wartet auf menschlichen Vote
- **Agent stale** — A2A `agent_silent` wurde erstellt
- **Task fertig** — Task wechselt auf `done` (optional, konfigurierbar)

**Funktionsweise:**
```
┌──────────────────────────────────┐
│  npx oriri watch                  │
│                                  │
│  File-Watcher auf .oriri/         │
│  ├── tasks/*.md geaendert?       │
│  │   → Status = needs_human?     │
│  │   → Notification senden       │
│  ├── agent-tasks/a2a-*.md neu?   │
│  │   → Consent noetig?           │
│  │   → Notification senden       │
│  └── Idle... (kein Polling,      │
│       reagiert auf File-Events)  │
└──────────────────────────────────┘

         ↓ OS Notification

┌──────────────────────────────────┐
│  Oriri — Human Gate               │
│  Login-Formular braucht Review   │
│  Task: task-a3f2c1               │
└──────────────────────────────────┘
```

**Akzeptanzkriterien:**
- [ ] `npx oriri watch` startet File-Watcher im Hintergrund
- [ ] Nutzt `fs.watch` / `chokidar` auf `.oriri/` Verzeichnis
- [ ] Sendet native OS-Notification per `node-notifier` (macOS, Linux, Windows)
- [ ] Benachrichtigt bei: needs_human, H2A-Antwort, offener Consent, agent_silent
- [ ] Konfigurierbar welche Events Notifications ausloesen
- [ ] Laeuft ressourcenschonend (kein Polling, nur File-Events)
- [ ] `npx oriri watch --stop` beendet den Watcher

---

## Phase 7: Resilienz

### T-025: File-Recovery & Rekonstruktion

**Typ:** feature
**Abhaengigkeiten:** T-005, T-010
**Beschreibung:**
Resilienz-Mechanismen nach Spec Abschnitt 9. Kein Permission-System, stattdessen Rekonstruktion aus verfuegbarem Kontext bei fehlenden/beschaedigten Dateien.

**Rekonstruktionsquellen (absteigend nach Qualitaet):**
1. Log-File + Agent-Memory → nahezu vollstaendig
2. Nur Log-File → gut
3. story.md Erwaehnung → grob
4. Nichts → Mensch muss neu erstellen

**Akzeptanzkriterien:**
- [ ] A2A Task `file_missing` bei fehlender task.md
- [ ] Agent mit Memory kann task.md sofort rekonstruieren
- [ ] Ohne Memory: Rekonstruktion aus Log-File
- [ ] story.md Recovery wenn Client connected
- [ ] Warnung an Menschen wenn Rekonstruktion nicht moeglich

---

### T-026: Backup-Empfehlung & Tooling

**Typ:** chore
**Abhaengigkeiten:** T-002
**Beschreibung:**
Dokumentation und optionales Tooling fuer stuendliche Backups des `.oriri/` Ordners. Im Server-Modus: Snapshot-Commits ins Git-Repo.

**Akzeptanzkriterien:**
- [ ] Dokumentation fuer Cron-basiertes Backup
- [ ] Optionaler `oriri backup` Befehl
- [ ] Im Server-Modus: Auto-Commit Snapshot (konfigurierbar)

---

## Phase 8: Server-Modus (Post-MVP — nicht Teil des initialen Builds)

### T-027: Server-Implementierung

**Typ:** feature
**Abhaengigkeiten:** T-015, T-007
**Beschreibung:**
Oriri Server fuer Team-Setups nach Spec Abschnitt 2.2. Server Memory als Single Source of Truth, Disk als Persistenz, WebSocket-Broadcast fuer Echtzeit-Sync.

**Akzeptanzkriterien:**
- [ ] `oriri server start` startet Server-Prozess
- [ ] WebSocket-basierte Verbindung
- [ ] Server-Memory ist SOT
- [ ] Echtzeit-Sync per Broadcast an alle Clients
- [ ] Race Conditions per Server-seitiger Serialisierung
- [ ] Persistenz auf Disk bei Shutdown

---

### T-028: Hybrid-Modus

**Typ:** feature
**Abhaengigkeiten:** T-027
**Beschreibung:**
Hybrid-Modus nach Spec Abschnitt 2.3: Primaer lokal, optionaler Sync mit Server. Offline-faehig, automatischer Sync wenn verfuegbar.

**Akzeptanzkriterien:**
- [ ] Offline-Arbeit wenn Server nicht erreichbar
- [ ] Automatischer Sync wenn Server verfuegbar
- [ ] Konflikte per Timestamp geloest (aelterer gewinnt)
- [ ] Konfigurierbares sync_interval

---

### T-029: WebSocket-Transport-Adapter

**Typ:** feature
**Abhaengigkeiten:** T-027
**Beschreibung:**
WebSocket-Implementierung des Storage-Interface (T-002b). Wenn `mode: server` in config.md, werden alle Operationen ueber WebSocket an den Server delegiert statt direkt ins Filesystem.

**Akzeptanzkriterien:**
- [ ] Implementiert das gleiche StorageInterface wie der Filesystem-Adapter
- [ ] Verbindet sich per `ws://` URL aus config.md
- [ ] Alle bestehenden Features funktionieren ohne Code-Aenderung
- [ ] Automatischer Reconnect bei Verbindungsverlust

---

## Abhaengigkeitsgraph

```
Phase 1 (Fundament)
T-001 → T-002 → T-002b (StorageInterface!)
                 T-003 (Config — liest config.yaml direkt, VOR Storage-Init)
                 T-002b → T-004 → T-005
                                → T-006 (braucht auch T-003)
                                → T-007

WICHTIG: T-002b ist der Schluessel. Ab hier geht alles ueber das
StorageInterface. Einzige Ausnahme: T-003 liest config.yaml direkt
weil die Config bestimmt welcher Adapter genutzt wird.

Phase 2 (Agent-Runtime)
T-003 + T-007 → T-008 (Registrierung)
T-008 + T-004 + T-005 + T-010 → T-008b (Agent-Runner, dauerhaft)
T-008 + T-005 + T-012 → T-009 (Self-Healing, laeuft als Teil von T-008b Idle)

Phase 3 (Gedaechtnis)
T-002b + T-006 → T-010 → T-011

Phase 4 (A2A)
T-002b → T-012 → T-013
               → T-014

Phase 5 (MCP)
T-004 + T-005 + T-010 → T-015 → T-016 → T-017 → T-018
                                               → T-019

Phase 6 (Notifications)
T-004 + T-005 → T-020 (File-Watcher, OS-Notifications)

Phase 7 (Resilienz)
T-005 + T-010 → T-025
T-002 → T-026

Phase 8 (Server, Post-MVP)
T-015 + T-007 → T-027 → T-028
                       → T-029 (WebSocketStorage implementiert StorageInterface)
```

---

## Offene Fragen aus der Spec

| ID | Frage | Relevant fuer |
|---|---|---|
| OQ-01 | Priority Score: Wer berechnet ihn? Manuell, automatisch, oder Agent? | T-004 |
| OQ-02 | Human Gate Erkennung: Regelbasiert nach Task-Typ oder Agent-Entscheidung? | T-022 |
| OQ-03 | Multi-Projekt: Eine Instanz pro Projekt oder pro Organisation? | T-002 |
| OQ-04 | Context Bundle Groesse: Ab wann automatisch zusammenfassen? | T-004 |
| OQ-05 | Dep-Update: Was passiert mit abhaengigen Tasks bei CHANGES_REQUESTED? | T-013 |
| OQ-06 | Hybrid Konflikte: Exakte Strategie bei State-Divergenz? | T-028 |
| OQ-07 | H2A Routing: COORDINATOR bevorzugt oder jeder GENERALIST? | T-023 |
| OQ-08 | ~~CLI Technologie~~ — entfaellt, keine TUI mehr, nur Notification Watcher | — |
| OQ-09 | Token-Tracking: Wie werden Kosten pro Agent gemessen? | T-024 |
