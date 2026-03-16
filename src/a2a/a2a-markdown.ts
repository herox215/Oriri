import type { A2AStatus, A2AType } from './a2a-types.js';

export type VoteValue = 'YES' | 'NO' | 'ABSTAIN';

export interface VoteEntry {
  agentId: string;
  vote: VoteValue;
  reason?: string;
  castAt: string;
}

export interface VoterEntry {
  id: string;
  model: string;
}

export interface A2AMarkdownFields {
  id: string;
  type: A2AType;
  status: A2AStatus;
  createdBy: string;
  createdAt: string;
  targetTaskId?: string;
  targetAgentId?: string;
  description: string;
  voters?: VoterEntry[];
  deadline?: string;
}

export function buildA2AMarkdown(fields: A2AMarkdownFields): string {
  const targetTask = fields.targetTaskId ?? '—';
  const targetAgent = fields.targetAgentId ?? '—';

  const votersRow =
    fields.voters && fields.voters.length > 0
      ? `| voters | ${fields.voters.map((v) => `${v.id}:${v.model}`).join(',')} |\n`
      : '';
  const deadlineRow = fields.deadline ? `| deadline | ${fields.deadline} |\n` : '';

  return `# A2A: ${fields.type}

| Field | Value |
|-------|-------|
| id | ${fields.id} |
| type | ${fields.type} |
| status | ${fields.status} |
| created_by | ${fields.createdBy} |
| created_at | ${fields.createdAt} |
| target_task | ${targetTask} |
| target_agent | ${targetAgent} |
${votersRow}${deadlineRow}
## Description

${fields.description}

## Votes

| Agent | Vote | Reason | Cast At |
|-------|------|--------|---------|
`;
}

export function extractA2AStatusFromMarkdown(markdown: string): A2AStatus | null {
  const match = /\| status \| (\S+)/.exec(markdown);
  const value = match?.[1] ?? null;
  if (value === 'open' || value === 'resolved') return value;
  return null;
}

export function extractA2ATypeFromMarkdown(markdown: string): string | null {
  const match = /\| type \| (\S+)/.exec(markdown);
  return match?.[1] ?? null;
}

export function extractA2ATargetTaskFromMarkdown(markdown: string): string | null {
  const match = /\| target_task \| (\S+)/.exec(markdown);
  const value = match?.[1] ?? null;
  return value === '—' ? null : value;
}

export function replaceA2AStatusInMarkdown(markdown: string, newStatus: A2AStatus): string {
  return markdown.replace(/(\| status \| )\S+/, `$1${newStatus}`);
}

export function extractVotersFromMarkdown(markdown: string): VoterEntry[] {
  const match = /\| voters \| (.+?) \|/.exec(markdown);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((pair) => {
      const colonIdx = pair.indexOf(':');
      if (colonIdx === -1) return { id: pair.trim(), model: '' };
      return { id: pair.slice(0, colonIdx).trim(), model: pair.slice(colonIdx + 1).trim() };
    })
    .filter((v) => v.id.length > 0);
}

export function extractDeadlineFromMarkdown(markdown: string): string | null {
  const match = /\| deadline \| (\S+)/.exec(markdown);
  return match?.[1] ?? null;
}

export function extractVotesFromMarkdown(markdown: string): VoteEntry[] {
  const sectionMatch = /## Votes\n[\s\S]*?\n\|[-| ]+\|\n([\s\S]*)$/.exec(markdown);
  if (!sectionMatch) return [];

  const rows = sectionMatch[1]
    .trim()
    .split('\n')
    .filter((line) => line.startsWith('|'));
  return rows
    .map((row) => {
      const cols = row
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());
      const [agentId, vote, reason, castAt] = cols;
      const entry: VoteEntry = {
        agentId: agentId ?? '',
        vote: (vote ?? 'YES') as VoteValue,
        castAt: castAt ?? '',
      };
      if (reason && reason !== '—') entry.reason = reason;
      return entry;
    })
    .filter((e) => e.agentId.length > 0);
}

function buildVotesSection(votes: VoteEntry[]): string {
  const rows = votes
    .map((v) => `| ${v.agentId} | ${v.vote} | ${v.reason ?? '—'} | ${v.castAt} |`)
    .join('\n');
  return `## Votes\n\n| Agent | Vote | Reason | Cast At |\n|-------|------|--------|---------|${rows.length > 0 ? '\n' + rows : ''}\n`;
}

export function replaceVotesSectionInMarkdown(markdown: string, votes: VoteEntry[]): string {
  const sectionIdx = markdown.indexOf('\n## Votes\n');
  if (sectionIdx === -1) return markdown + '\n' + buildVotesSection(votes);
  return markdown.slice(0, sectionIdx + 1) + buildVotesSection(votes);
}

export function appendVoteToMarkdown(markdown: string, entry: VoteEntry): string {
  const current = extractVotesFromMarkdown(markdown);
  return replaceVotesSectionInMarkdown(markdown, [...current, entry]);
}
