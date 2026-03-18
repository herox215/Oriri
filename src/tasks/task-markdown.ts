import type { TaskStatus } from './task-types.js';

export interface TaskMarkdownFields {
  id: string;
  title: string;
  status: TaskStatus;
  createdAt: string;
  description?: string;
}

export function buildTaskMarkdown(fields: TaskMarkdownFields): string {
  const description = fields.description ?? '';

  return `# ${fields.title}

| Field | Value |
|-------|-------|
| id | ${fields.id} |
| status | ${fields.status} |
| created_at | ${fields.createdAt} |

## Description

${description}
`;
}

export function extractTitleFromMarkdown(markdown: string): string | null {
  const match = /^# (.+)$/m.exec(markdown);
  return match?.[1] ?? null;
}

export function extractStatusFromMarkdown(markdown: string): string | null {
  const match = /\| status \| (\S+)/.exec(markdown);
  return match?.[1] ?? null;
}

export function replaceStatusInMarkdown(markdown: string, newStatus: TaskStatus): string {
  return markdown.replace(/(\| status \| )\S+/, `$1${newStatus}`);
}

export function extractDescriptionFromMarkdown(markdown: string): string {
  const match = /## Description\n\n([\s\S]*?)$/.exec(markdown);
  return match?.[1]?.trim() ?? '';
}
