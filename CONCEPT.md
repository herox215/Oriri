# Wellwerk — AI-First Ticketing System

## Problem

Bestehende Ticketing-Systeme (Jira, Linear, etc.) sind fuer Menschen gebaut. AI-Agents muessen sich ueber MCP-Adapter an diese Systeme anpassen — das ist wie ein Pferd vor ein Auto zu spannen.

Wellwerk dreht das um: Ein Ticketing-System, das primaer fuer AI-Agents gedacht ist, mit einer menschlichen Oberflaeche als Zweitinterface.

---

## Warum nicht Jira + MCP?

### Strukturelles Mismatch

- **Datenmodell fuer Menschen**: Story Points, Sprints, Boards, Epics — alles UI-Konzepte, die ein AI-Agent nicht braucht.
- **Freitext-Kontext**: Beschreibungen, Kommentare, Attachments — ein Agent muss alles zusammensuchen und parsen.
- **Kein Kontext-Budget**: Jira weiss nicht, wie viel Kontext ein Agent verarbeiten kann. Tickets sind oft zu gross oder zu vage.
- **Keine Verifikation**: "Done" ist ein manueller Spaltenwechsel, keine automatische Validierung.

### Technische Probleme

- **Latenz**: Jira-API ist langsam, MCP fuegt eine weitere Indirektion hinzu.
- **Rate Limits**: Bei vielen parallelen Agents schnell erreicht.
- **Kosten**: Jira-Lizenzen pro Seat + MCP-Server-Betrieb.
- **Vendor Lock-in**: Atlassian-Oekosystem mit eigenen Regeln.

---

## Kern-Ideen

### 1. Strukturierter Kontext statt Freitext

Jedes Ticket enthaelt maschinenlesbaren Kontext:

```yaml
ticket:
  id: WW-42
  title: "Rate Limiting fuer /api/users Endpoint"
  context:
    files:
      - src/api/users.ts
      - src/middleware/rateLimit.ts
    dependencies:
      - WW-39  # Redis-Integration
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

Kein Parsen von Freitext noetig. Der Agent weiss sofort, was zu tun ist, welche Dateien relevant sind, und wie Erfolg aussieht.

### 2. Automatische Dekomposition

Ein grosses Feature-Ticket wird automatisch in Sub-Tasks zerlegt, die:

- **In ein Context Window passen** — das System kennt die Token-Limits der Agents.
- **Einzeln validierbar sind** — jeder Sub-Task hat eigene Akzeptanzkriterien.
- **Klare Abhaengigkeiten haben** — DAG statt flacher Liste.

```
WW-100: "User Authentication"
  ├── WW-101: "JWT Token Generation" (keine Abhaengigkeiten)
  ├── WW-102: "Login Endpoint" (abhaengig von WW-101)
  ├── WW-103: "Token Refresh" (abhaengig von WW-101)
  └── WW-104: "Logout & Token Invalidation" (abhaengig von WW-102, WW-103)
```

### 3. Validierung & Confidence-Level

Nicht jede Validierung ist gleich viel wert. Wellwerk modelliert das explizit ueber ein **Confidence-System**:

#### Validierungsstufen

| Stufe | Validiert durch | Confidence | Beispiel |
|---|---|---|---|
| **automated** | Tests, Linter, CI | Basis | Unit-Tests gruen, keine Lint-Fehler |
| **agent-reviewed** | Zweiter AI-Agent | Mittel | Code-Review durch Review-Agent |
| **human-verified** | Mensch | Hoch | Entwickler hat getestet und abgenommen |
| **human-approved** | Stakeholder/PO | Hoechste | Product Owner hat Feature abgenommen |

Je mehr menschliche Validierung, desto hoeher die Confidence. Ein Ticket das nur durch automatische Tests validiert wurde hat weniger Gewicht als eines, das ein Mensch abgenommen hat.

#### Warum menschliche Validierung wertvoller ist

- **UI/UX**: Kein automatischer Test kann beurteilen ob etwas sich richtig anfuehlt, intuitiv ist, oder aesthetisch stimmt. UI-Tickets erfordern immer menschliche Validierung.
- **Business-Logik**: Automatische Tests pruefen ob Code korrekt laeuft — Menschen pruefen ob das Richtige gebaut wurde.
- **Edge Cases**: Menschen erkennen Probleme die kein Test abdeckt ("Das funktioniert, aber was passiert wenn der User...").
- **Vertrauen**: Ein menschlich validiertes Ticket gibt dem Team mehr Sicherheit als ein rein automatisch geschlossenes.

#### Ticket-Konfiguration

```yaml
validation:
  # Automatisch pruefbare Kriterien
  automated:
    - type: test
      command: "npm test -- --grep 'rate limit'"
    - type: lint
      command: "npm run lint"

  # Menschliche Validierung — erforderlich oder optional
  human:
    required: true
    type: visual_review    # visual_review | functional_review | stakeholder_approval
    prompt: "Pruefe ob das Login-Formular korrekt dargestellt wird"
    assigned_to: null      # Kann einem bestimmten Menschen zugewiesen werden

  # Minimum-Confidence fuer Abschluss
  min_confidence: human-verified
```

#### Confidence wirkt sich auf den Gesamtprozess aus

- **Deployment-Gates**: Nur Tickets mit `human-verified` oder hoeher duerfen in Production.
- **Metriken**: Das System trackt das Verhaeltnis automatisch vs. menschlich validierter Tickets — zu wenig menschliche Reviews ist ein Warnsignal.
- **Ticket-Wertigkeit**: Menschlich validierte Tickets haben hoehere Prioritaet beim Mergen und Release-Planung.

#### Kategorien die immer menschliche Validierung brauchen

- **UI/Frontend-Aenderungen**: Visuelles, Layout, Animationen, UX-Flows
- **Texte & Copy**: Formulierungen, Tonalitaet, Rechtschreibung im Kontext
- **Neue Features**: Erstes Release eines Features sollte immer von einem Menschen getestet werden
- **Security-relevante Aenderungen**: Auth, Permissions, Datenzugriff

### 4. Duale Aufwandsschaetzung (AI + Mensch)

Aufwandsschaetzung funktioniert wie Planning Poker — beide Seiten schaetzen unabhaengig, ohne die Schaetzung der Gegenseite zu kennen. Erst wenn beide geschaetzt haben, werden die Werte sichtbar.

#### Ablauf

```
1. Ticket wird erstellt
2. AI analysiert und gibt ihre Schaetzung ab (automatisch)
3. Mensch gibt seine Schaetzung ab (ohne AI-Schaetzung zu sehen)
4. Beide Schaetzungen werden aufgedeckt
5. Bei grosser Abweichung: Diskussion / Klaerung
```

#### Warum blind schaetzen?

- **Keine Beeinflussung**: Der Mensch soll nicht von der AI-Schaetzung geankert werden — und umgekehrt.
- **Abweichungen sind wertvoll**: Wenn AI "2h" sagt und der Mensch "2 Tage", dann fehlt einer Seite Kontext. Das ist ein Signal, kein Fehler.
- **Kalibrierung**: Ueber Zeit lernt das System, wo AI und Mensch systematisch abweichen und kann das einbeziehen.

#### Schaetzungs-Dimensionen

AI und Mensch schaetzen nicht nur "wie lange", sondern auf mehreren Achsen:

```yaml
estimation:
  ai:
    locked: true           # Erst nach menschlicher Schaetzung sichtbar
    effort: "2h"           # Geschaetzte Bearbeitungszeit
    complexity: medium     # low | medium | high | critical
    risk: low              # Risiko fuer unerwartete Probleme
    context_needed: 12000  # Tokens an Kontext die der Agent braucht
    confidence: 0.85       # Wie sicher ist die AI sich bei dieser Schaetzung
    reasoning: |
      Klare Anforderung, betroffene Dateien sind ueberschaubar.
      Rate-Limiting-Pattern existiert bereits in der Codebase.

  human:
    locked: true           # Erst nach AI-Schaetzung sichtbar
    effort: "4h"
    complexity: medium
    risk: medium
    reasoning: |
      Grundsaetzlich machbar, aber wir muessen aufpassen
      dass die Redis-Connection unter Last stabil bleibt.

  # Wird automatisch berechnet nach Aufdeckung
  comparison:
    effort_delta: "+2h"    # Mensch schaetzt hoeher
    risk_delta: "+1"       # Mensch sieht mehr Risiko
    needs_discussion: true # Abweichung ueber Schwellwert
    insight: |
      Mensch sieht Infrastruktur-Risiko (Redis unter Last)
      das die AI nicht beruecksichtigt hat.
```

#### Was passiert bei Abweichungen?

| Abweichung | Interpretation | Aktion |
|---|---|---|
| AI >> Mensch | AI sieht technische Komplexitaet die dem Menschen nicht bewusst ist | AI erklaert ihre Bedenken |
| Mensch >> AI | Mensch hat Domainwissen / Erfahrung die der AI fehlt | Kontext wird dem Ticket hinzugefuegt |
| Beide aehnlich | Gutes gemeinsames Verstaendnis | Ticket kann starten |
| Beide unsicher | Ticket ist unklar definiert | Ticket muss verfeinert werden |

#### Kalibrierung ueber Zeit

Das System trackt:

- **Schaetzgenauigkeit**: Wie nah waren AI- und Mensch-Schaetzung am tatsaechlichen Aufwand?
- **Systematische Abweichungen**: Unterschaetzt die AI bestimmte Ticket-Typen? Ueberschaetzt der Mensch Frontend-Aufwand?
- **Lerneffekt**: AI-Schaetzungen werden besser, weil das System aus vergangenen Abweichungen lernt.

```
Kalibrierungs-Report:
  AI-Genauigkeit (letzte 30 Tickets): 72%
  Mensch-Genauigkeit (letzte 30 Tickets): 68%
  AI unterschaetzt systematisch: Security-Tickets (+40%)
  Mensch ueberschaetzt systematisch: Refactoring-Tickets (+25%)
```

### 5. Kontext-Budget-Management

Das System weiss:

- Wie viel Kontext ein Agent maximal verarbeiten kann
- Welche Dateien fuer ein Ticket relevant sind (und wie gross sie sind)
- Ob ein Ticket in eine Agent-Session passt oder aufgeteilt werden muss

```
Ticket WW-42:
  Relevanter Kontext: ~12.000 Tokens
  Agent-Limit: 80.000 Tokens
  Status: Passt in eine Session ✓
```

### 5. Dependency-Graph als First-Class Konzept

Nicht "linked issues" als Afterthought, sondern ein echter DAG:

- **Blockiert-durch**: Agent startet nicht, bevor Abhaengigkeit erledigt ist.
- **Parallelisierbar**: System erkennt automatisch, welche Tickets gleichzeitig bearbeitet werden koennen.
- **Kritischer Pfad**: Welche Tickets muessen zuerst fertig werden, um den Gesamtfortschritt nicht zu blockieren?

### 6. Feedback-Loop & Lernfaehigkeit

Wenn ein Agent an einem Ticket scheitert, erfasst das System:

- **Warum?** — Unklare Beschreibung? Fehlender Kontext? Widerspruch in Kriterien?
- **Was half?** — Welche zusaetzlichen Infos brauchte der Agent?
- **Muster**: Wiederholen sich bestimmte Fehlertypen?

Dieses Wissen fliesst zurueck in die Ticket-Erstellung: Bessere Templates, automatische Kontext-Anreicherung, Warnungen bei unklaren Anforderungen.

### 7. Multi-Agent-Orchestrierung

- **Zuweisung**: Welcher Agent-Typ eignet sich fuer welches Ticket? (Code-Agent, Test-Agent, Review-Agent)
- **Parallelisierung**: Unabhaengige Tickets gleichzeitig bearbeiten.
- **Handoffs**: Agent A erstellt Code → Agent B reviewed → Agent C schreibt Tests.
- **Conflict Detection**: Zwei Agents arbeiten an ueberlappenden Dateien? System erkennt das und serialisiert.

### 8. Tickets als Code

Tickets leben im Repository, nicht in einer externen Datenbank:

```
.wellwerk/
  tickets/
    WW-042.yaml
    WW-043.yaml
  graphs/
    sprint-2024-03.yaml
  history/
    WW-042.log
```

Vorteile:

- **Versioniert**: Git-tracked, diffbar, reviewbar.
- **Reproduzierbar**: Ticket-Zustand ist immer konsistent mit dem Code.
- **Offline-faehig**: Kein externer Service noetig.
- **Kein Vendor Lock-in**: Plain YAML/JSON Files.

---

## Menschliches Interface: Aufgaben statt Tickets

Der Mensch sieht keine Tickets, keine YAML-Strukturen, keine DAGs. Er sieht **Aufgaben** — einfache, klare Handlungsaufforderungen. Die interne Ticket-Struktur ist ein Implementierungsdetail, das nur die AI interessiert.

### Philosophie

Der Mensch ist kein Ticket-Manager. Er ist Entscheider, Pruefer und Wissensquelle. Das Interface spiegelt das wider:

- **Keine Boards, keine Spalten, keine Sprints** — das sind Organisationskonzepte fuer Menschen die Arbeit verwalten. Hier verwaltet die AI.
- **Keine Ticket-IDs, keine Felder, keine Workflows** — der Mensch muss nicht wissen dass intern WW-042.yaml existiert.
- **Stattdessen: Eine Aufgabenliste** — sortiert nach Dringlichkeit, gefiltert nach dem was der Mensch tun kann.

### Was der Mensch sieht

Eine einfache, priorisierte Liste mit Aufgaben die seine Aufmerksamkeit brauchen:

```
┌─────────────────────────────────────────────────────┐
│  Wellwerk                            3 Aufgaben     │
│─────────────────────────────────────────────────────│
│                                                     │
│  ⬤  Login-Formular visuell pruefen                  │
│     AI hat das Login-Formular umgebaut.              │
│     → Sieht das Layout korrekt aus?                  │
│     [Passt ✓]  [Aenderungen noetig ✎]               │
│                                                     │
│  ⬤  Aufwand schaetzen: Passwort-Reset Feature       │
│     AI schaetzt: ausstehend (wartet auf dich)        │
│     → Wie aufwendig ist das?                         │
│     [Einfach]  [Mittel]  [Komplex]  [Unklar]        │
│                                                     │
│  ⬤  Entscheidung: Redis oder Memcached?             │
│     AI braucht eine Architektur-Entscheidung.        │
│     → Welchen Cache-Layer sollen wir nutzen?         │
│     [Antworten ✎]                                    │
│                                                     │
│  ── Erledigt heute ─────────────────────────────    │
│  ✓  API Rate-Limiting geprueft (vor 2h)             │
│  ✓  Aufwand geschaetzt: User-Export (vor 4h)        │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Aufgaben-Typen fuer Menschen

Der Mensch bekommt nur Aufgaben die tatsaechlich einen Menschen brauchen:

| Typ | Wann | Beispiel |
|---|---|---|
| **Visuell pruefen** | UI-Aenderung fertig | "Sieht der neue Header richtig aus?" |
| **Funktional testen** | Feature implementiert | "Funktioniert der Checkout-Flow?" |
| **Aufwand schaetzen** | Neues Ticket, AI wartet | "Wie komplex ist das?" |
| **Entscheidung treffen** | AI braucht Input | "SQL oder NoSQL fuer diesen Use Case?" |
| **Kontext liefern** | AI fehlt Wissen | "Wie funktioniert der Legacy-Import?" |
| **Abnehmen** | Feature release-ready | "Kann das live gehen?" |

### Was der Mensch NICHT sieht

- Ticket-Interna (YAML, IDs, DAGs, Abhaengigkeiten)
- Rein technische Tickets (Refactoring, Test-Fixes, Dependency-Updates)
- Agent-Zuweisungen und Orchestrierung
- Kontext-Budget-Berechnungen
- Tickets die nur automatische Validierung brauchen

### Benachrichtigungen statt Dashboard

Der Mensch muss kein Dashboard oeffnen. Aufgaben kommen zu ihm:

- **Slack/Teams**: "Login-Formular ist fertig — kannst du kurz draufschauen?"
- **CLI**: `wellwerk tasks` zeigt offene Aufgaben
- **Email-Digest**: Taegliche Zusammenfassung wenn gewuenscht
- **IDE-Integration**: Aufgaben als Sidebar in VS Code / Cursor

### Feedback ist einfach

Statt Kommentare in Tickets zu schreiben:

```
AI:  "Sieht der neue Header richtig aus?"

Mensch: "Ja, passt."
→ Ticket wird als human-verified geschlossen.

Mensch: "Nee, der Abstand oben ist zu gross."
→ AI bekommt Feedback, erstellt automatisch Follow-up,
   arbeitet Aenderung ein, fragt erneut.
```

Der Mensch gibt natuerlichsprachiges Feedback. Das System kuemmert sich um den Rest.

---

## Abgrenzung

| Aspekt | Jira + MCP | Wellwerk |
|---|---|---|
| Primaeres Interface | Mensch (Web UI) | AI-Agent (intern) + Mensch (Aufgabenliste) |
| Datenmodell | Human Workflows | Maschinenlesbarer Kontext |
| Ticket-Groesse | Beliebig | Kontext-Budget-bewusst |
| Verifikation | Manuell | Confidence-Stufen (auto → human) |
| Abhaengigkeiten | Linked Issues | DAG mit Scheduling |
| Speicherung | Cloud-Datenbank | Repository (Git-tracked) |
| Feedback | Retrospektiven | Automatische Analyse |
| Multi-Agent | Nicht vorgesehen | Orchestrierung eingebaut |

---

## Zielgruppe

1. **Teams, die AI-Agents fuer Entwicklung einsetzen** — Claude Code, Cursor, Copilot Workspace, etc.
2. **Unternehmen mit Multi-Agent-Setups** — Mehrere Agents arbeiten parallel an einem Codebase.
3. **Solo-Entwickler mit AI-Unterstuetzung** — Eine Person steuert, AI-Agents fuehren aus.

---

## Offene Fragen

- Wie integriert sich Wellwerk in bestehende CI/CD-Pipelines?
- Soll es einen zentralen Server geben oder ist es rein lokal/repo-basiert?
- Wie wird Priorisierung gehandhabt — menschlich gesteuert oder AI-assisted?
- Lizenzmodell: Open Source? Commercial? Hybrid?
