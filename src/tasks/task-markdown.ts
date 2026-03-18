import type { TaskStatus, TaskDetails } from './task-types.js';

export interface TaskMarkdownFields {
  id: string;
  title: string;
  status: TaskStatus;
  createdAt: string;
  description?: string;
  complexity?: number;
  branch?: string;
  worktreePath?: string;
}

export function buildTaskMarkdown(fields: TaskMarkdownFields): string {
  const description = fields.description ?? '';

  const complexityRow =
    fields.complexity != null ? `| complexity | ${String(fields.complexity)} |\n` : '';
  const branchRow = fields.branch != null ? `| branch | ${fields.branch} |\n` : '';
  const worktreeRow =
    fields.worktreePath != null ? `| worktree_path | ${fields.worktreePath} |\n` : '';

  return `# ${fields.title}

| Field | Value |
|-------|-------|
| id | ${fields.id} |
| status | ${fields.status} |
| created_at | ${fields.createdAt} |
${complexityRow}${branchRow}${worktreeRow}
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

export function extractBranchFromMarkdown(markdown: string): string | null {
  const match = /\| branch \| (.+?) \|/.exec(markdown);
  return match?.[1]?.trim() ?? null;
}

export function extractWorktreePathFromMarkdown(markdown: string): string | null {
  const match = /\| worktree_path \| (.+?) \|/.exec(markdown);
  return match?.[1]?.trim() ?? null;
}

export function replaceFieldInMarkdown(markdown: string, field: string, value: string): string {
  const regex = new RegExp(`(\\| ${field} \\| ).+? \\|`);
  return markdown.replace(regex, `$1${value} |`);
}

export function addFieldToMarkdown(markdown: string, field: string, value: string): string {
  const tableEnd = /(\n\n## Description)/;
  return markdown.replace(tableEnd, `| ${field} | ${value} |\n$1`);
}

export function removeFieldFromMarkdown(markdown: string, field: string): string {
  const regex = new RegExp(`\\| ${field} \\| .+? \\|\\n`, 'g');
  return markdown.replace(regex, '');
}

export function extractCreatedAtFromMarkdown(markdown: string): string | null {
  const match = /\| created_at \| (\S+)/.exec(markdown);
  return match?.[1] ?? null;
}

export function parseTaskMarkdown(id: string, markdown: string): TaskDetails {
  const branch = extractBranchFromMarkdown(markdown) ?? undefined;
  const worktreePath = extractWorktreePathFromMarkdown(markdown) ?? undefined;

  return {
    id,
    title: extractTitleFromMarkdown(markdown) ?? id,
    status: (extractStatusFromMarkdown(markdown) ?? 'open') as TaskStatus,
    createdAt: extractCreatedAtFromMarkdown(markdown) ?? '',
    description: extractDescriptionFromMarkdown(markdown),
    complexity: extractComplexityFromMarkdown(markdown),
    ...(branch != null && { branch }),
    ...(worktreePath != null && { worktreePath }),
  };
}
