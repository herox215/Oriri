import type { TaskStatus, TaskType } from './task-types.js';
import { HUMAN_GATE_TYPES } from './task-types.js';

export interface TaskMarkdownFields {
  id: string;
  title: string;
  type: TaskType;
  status: TaskStatus;
  assignedTo?: string;
  createdBy: string;
  createdAt: string;
  contextBundle?: string;
  dependencies?: string[];
}

export function buildTaskMarkdown(fields: TaskMarkdownFields): string {
  const autoHumanGate = HUMAN_GATE_TYPES.includes(fields.type) ? 'yes' : 'no';
  const assignedTo = fields.assignedTo ?? '—';
  const deps =
    fields.dependencies && fields.dependencies.length > 0
      ? fields.dependencies.map((d) => `- ${d}`).join('\n')
      : 'none';
  const context = fields.contextBundle ?? '';

  return `# ${fields.title}

| Field | Value |
|-------|-------|
| id | ${fields.id} |
| type | ${fields.type} |
| status | ${fields.status} |
| assigned_to | ${assignedTo} |
| created_by | ${fields.createdBy} |
| created_at | ${fields.createdAt} |
| auto_human_gate | ${autoHumanGate} |

## Context Bundle

${context}

## Dependencies

${deps}
`;
}

export function replaceStatusInMarkdown(markdown: string, newStatus: TaskStatus): string {
  return markdown.replace(/(\| status \| )\S+/, `$1${newStatus}`);
}

export function extractStatusFromMarkdown(markdown: string): string | null {
  const match = /\| status \| (\S+)/.exec(markdown);
  return match?.[1] ?? null;
}

export function replaceTypeInMarkdown(markdown: string, newType: TaskType): string {
  return markdown.replace(/(\| type \| )\S+/, `$1${newType}`);
}

export function replaceContextBundleInMarkdown(markdown: string, newContext: string): string {
  return markdown.replace(
    /(## Context Bundle\n\n)[\s\S]*?(?=\n##|$)/,
    `$1${newContext}\n`,
  );
}

export function extractTypeFromMarkdown(markdown: string): string | null {
  const match = /\| type \| (\S+)/.exec(markdown);
  return match?.[1] ?? null;
}

export function extractAssignedToFromMarkdown(markdown: string): string | null {
  const match = /\| assigned_to \| (.+?) \|/.exec(markdown);
  return match?.[1] ?? null;
}

export function replaceAssignedToInMarkdown(markdown: string, agentId: string): string {
  return markdown.replace(/(\| assigned_to \| ).+?( \|)/, `$1${agentId}$2`);
}

export function clearAssignedToInMarkdown(markdown: string): string {
  return markdown.replace(/(\| assigned_to \| ).+?( \|)/, `$1—$2`);
}

export function replaceDependenciesInMarkdown(markdown: string, dependencies: string[]): string {
  const deps = dependencies.length > 0 ? dependencies.map((d) => `- ${d}`).join('\n') : 'none';
  return markdown.replace(
    /(## Dependencies\n+)[\s\S]*?(?=\n##|$)/,
    `$1${deps}\n`,
  );
}

export function extractDependenciesFromMarkdown(markdown: string): string[] {
  const section = /## Dependencies\n+([\s\S]*?)(?:\n##|$)/.exec(markdown);
  if (!section?.[1]) return [];
  return section[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim())
    .filter((l) => l !== '' && l !== 'none');
}
