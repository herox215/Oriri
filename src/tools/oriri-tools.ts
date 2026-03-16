import type { AgentRole } from '../config/config-types.js';
import type { LogService } from '../logs/log-service.js';
import type { StorageInterface } from '../storage/storage-interface.js';
import type { TaskService } from '../tasks/task-service.js';
import {
  extractStatusFromMarkdown,
  extractTypeFromMarkdown,
  extractAssignedToFromMarkdown,
} from '../tasks/task-markdown.js';
import type { ToolDefinition, ToolResult } from './tool-types.js';
import type { ConsentService, VoteValue } from '../a2a/consent-service.js';

export interface OririToolsDeps {
  taskService: TaskService;
  logService: LogService;
  storage: StorageInterface;
  consentService: ConsentService;
  agentId: string;
  role: AgentRole;
}

function ok(content: string): ToolResult {
  return { content };
}

function err(content: string): ToolResult {
  return { content, isError: true };
}

export function createOririTools(deps: OririToolsDeps): ToolDefinition[] {
  const { taskService, logService, storage, consentService, agentId, role } = deps;

  return [
    {
      name: 'list_tasks',
      description:
        'List all tasks with their ID, title, status, type, and assigned agent. Use this to find open tasks to work on.',
      inputSchema: { type: 'object', properties: {} },
      async handler(): Promise<ToolResult> {
        try {
          const ids = await taskService.listTasks();
          if (ids.length === 0) {
            return ok('No tasks found.');
          }

          const summaries: string[] = [];
          for (const id of ids) {
            const markdown = await taskService.readTask(id);
            const title = /^# (.+)$/m.exec(markdown)?.[1] ?? 'Untitled';
            const status = extractStatusFromMarkdown(markdown) ?? 'unknown';
            const type = extractTypeFromMarkdown(markdown) ?? 'unknown';
            const assignedTo = extractAssignedToFromMarkdown(markdown) ?? '—';
            summaries.push(`- ${id}: [${type}] "${title}" (${status}, assigned: ${assignedTo})`);
          }
          return ok(summaries.join('\n'));
        } catch (error: unknown) {
          return err(error instanceof Error ? error.message : 'Failed to list tasks');
        }
      },
    },
    {
      name: 'claim_task',
      description:
        'Claim an open task for processing. The task status will change to "planning" and be assigned to you.',
      inputSchema: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'The ID of the task to claim' },
        },
        required: ['task_id'],
      },
      async handler(input: unknown): Promise<ToolResult> {
        try {
          const { task_id } = input as { task_id: string };
          await taskService.claimTask(task_id, agentId, role);
          return ok(`Successfully claimed task ${task_id}.`);
        } catch (error: unknown) {
          return err(error instanceof Error ? error.message : 'Failed to claim task');
        }
      },
    },
    {
      name: 'append_log',
      description:
        'Append a progress log entry to a task. Use this to document your work on a task.',
      inputSchema: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'The ID of the task' },
          message: { type: 'string', description: 'The log message to append' },
        },
        required: ['task_id', 'message'],
      },
      async handler(input: unknown): Promise<ToolResult> {
        try {
          const { task_id, message } = input as { task_id: string; message: string };
          await logService.appendLog(task_id, agentId, message);
          return ok('Log entry appended.');
        } catch (error: unknown) {
          return err(error instanceof Error ? error.message : 'Failed to append log');
        }
      },
    },
    {
      name: 'complete_task',
      description:
        'Mark a task as done with a summary. Use this when you have finished all work on a task.',
      inputSchema: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'The ID of the task to complete' },
          summary: { type: 'string', description: 'A brief summary of the work done' },
        },
        required: ['task_id', 'summary'],
      },
      async handler(input: unknown): Promise<ToolResult> {
        try {
          const { task_id, summary } = input as { task_id: string; summary: string };
          await logService.appendLog(task_id, agentId, `completing task: ${summary}`);
          await taskService.updateStatus(task_id, 'done', agentId);
          return ok(`Task ${task_id} marked as done.`);
        } catch (error: unknown) {
          return err(error instanceof Error ? error.message : 'Failed to complete task');
        }
      },
    },
    {
      name: 'get_story',
      description:
        'START HERE. Read this first before doing anything else. ' +
        'The story is the collective memory of the project — it tells you what happened, ' +
        'what is going on, and what decisions were made. ' +
        'Always read the story before listing or inspecting individual tasks.',
      inputSchema: { type: 'object', properties: {} },
      async handler(): Promise<ToolResult> {
        try {
          const content = await storage.readStory();
          return ok(content || '(story.md is empty)');
        } catch (error: unknown) {
          return err(error instanceof Error ? error.message : 'Failed to read story');
        }
      },
    },
    {
      name: 'create_a2a',
      description: 'Create an agent-to-agent coordination task. (Not yet implemented — T-012)',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', description: 'The A2A task type' },
          description: { type: 'string', description: 'Description of the coordination request' },
        },
        required: ['type', 'description'],
      },
      handler(): Promise<ToolResult> {
        return Promise.resolve(
          err('A2A system is not yet implemented (T-012). Cannot create A2A tasks.'),
        );
      },
    },
    {
      name: 'vote',
      description: 'Cast your vote (YES/NO/ABSTAIN) on an open A2A coordination proposal.',
      inputSchema: {
        type: 'object',
        properties: {
          a2a_id: { type: 'string', description: 'The A2A task ID to vote on' },
          vote: { type: 'string', enum: ['YES', 'NO', 'ABSTAIN'], description: 'Your vote' },
          reason: { type: 'string', description: 'Optional reason for your vote' },
        },
        required: ['a2a_id', 'vote'],
      },
      async handler(input: unknown): Promise<ToolResult> {
        try {
          const {
            a2a_id,
            vote: voteValue,
            reason,
          } = input as { a2a_id: string; vote: VoteValue; reason?: string };
          await consentService.vote(a2a_id, agentId, role, voteValue, reason);
          return ok(`Vote ${voteValue} cast on A2A task ${a2a_id}.`);
        } catch (error: unknown) {
          return err(error instanceof Error ? error.message : 'Failed to cast vote');
        }
      },
    },
  ];
}
