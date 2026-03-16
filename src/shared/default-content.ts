export const CONFIG_YAML = `# Oriri Configuration
mode: local
`;

export const STORY_MD = `# Story

<!-- Collective memory for all agents. Append-only. -->
`;

export const STORY_ARCHIVE_MD = `# Story Archive

<!-- Archived entries from story.md. Append-only. -->
`;

export const RULES_MD = `# Consent Rules

## Default Voting Rule

- **Method:** Majority
- **Threshold:** >50% of active agents
- **Silence:** Counts as YES after deadline
- **Tie (50:50):** Not accepted

## Meta-Rule (Hardcoded)

- Changes to rules.md require: Unanimous + at least 1 human approval
- This rule cannot be changed
`;

export const ACTIVE_AGENTS_MD = `# Active Agents

| ID | Role | Model | PID | Since | Display Name | Client Type | Client Software | Poll Interval | Last Seen |
|----|------|-------|-----|-------|--------------|-------------|-----------------|---------------|-----------|
`;
