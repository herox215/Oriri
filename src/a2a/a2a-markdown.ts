import type { A2AStatus, A2AType } from './a2a-types.js';

export interface A2AMarkdownFields {
  id: string;
  type: A2AType;
  status: A2AStatus;
  createdBy: string;
  createdAt: string;
  targetTaskId?: string;
  targetAgentId?: string;
  description: string;
}

export function buildA2AMarkdown(fields: A2AMarkdownFields): string {
  const targetTask = fields.targetTaskId ?? '—';
  const targetAgent = fields.targetAgentId ?? '—';

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

## Description

${fields.description}
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
