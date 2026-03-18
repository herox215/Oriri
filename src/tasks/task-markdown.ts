import type { TaskStatus, TaskDetails } from './task-types.js';

export interface TaskMarkdownFields {
  id: string;
  title: string;
  status: TaskStatus;
  createdAt: string;
  description?: string;
  complexity?: number;
}

export function buildTaskMarkdown(fields: TaskMarkdownFields): string {
  const description = fields.description ?? '';

  const complexityRow =
    fields.complexity != null ? `| complexity | ${String(fields.complexity)} |\n` : '';

  return `# ${fields.title}

| Field | Value |
|-------|-------|
| id | ${fields.id} |
| status | ${fields.status} |
| created_at | ${fields.createdAt} |
${complexityRow}
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

export function extractComplexityFromMarkdown(markdown: string): number | null {
  const match = /\| complexity \| (\d+)/.exec(markdown);
  return match ? Number(match[1]) : null;
}

export function extractCreatedAtFromMarkdown(markdown: string): string | null {
  const match = /\| created_at \| (\S+)/.exec(markdown);
  return match?.[1] ?? null;
}

export function parseTaskMarkdown(id: string, markdown: string): TaskDetails {
  return {
    id,
    title: extractTitleFromMarkdown(markdown) ?? id,
    status: (extractStatusFromMarkdown(markdown) ?? 'open') as TaskStatus,
    createdAt: extractCreatedAtFromMarkdown(markdown) ?? '',
    description: extractDescriptionFromMarkdown(markdown),
    complexity: extractComplexityFromMarkdown(markdown),
  };
}
