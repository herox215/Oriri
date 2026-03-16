import type { AgentRole } from '../config/config-types.js';
import type { LogService } from '../logs/log-service.js';
import type { StorageInterface } from '../storage/storage-interface.js';
import type { TaskService } from '../tasks/task-service.js';
import {
  extractStatusFromMarkdown,
  extractTypeFromMarkdown,
  extractAssignedToFromMarkdown,
} from '../tasks/task-markdown.js';
import { extractA2AStatusFromMarkdown } from '../a2a/a2a-markdown.js';
import type { ToolDefinition, ToolResult } from './tool-types.js';
import type { ConsentService, VoteValue } from '../a2a/consent-service.js';
import type { A2AService } from '../a2a/a2a-service.js';
import { A2A_TYPES, type A2AType } from '../a2a/a2a-types.js';

export interface OririToolsDeps {
  taskService: TaskService;
  logService: LogService;
  storage: StorageInterface;
  consentService: ConsentService;
  a2aService: A2AService;
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
  const { taskService, logService, storage, consentService, a2aService, agentId, role } = deps;

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
      description:
        'Create an agent-to-agent coordination task. Types: merge_proposal, split_proposal, dependency_discovery, agent_silent, deadlock_detected, story_archive, file_missing, conflict_flag, rules_change.',
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: [...A2A_TYPES],
            description: 'The A2A task type',
          },
          description: { type: 'string', description: 'Description of the coordination request' },
          target_task_id: {
            type: 'string',
            description: 'Optional: the task this A2A relates to',
          },
        },
        required: ['type', 'description'],
      },
      async handler(input: unknown): Promise<ToolResult> {
        try {
          const { type: a2aType, description: desc, target_task_id } = input as {
            type: string;
            description: string;
            target_task_id?: string;
          };
          if (!A2A_TYPES.includes(a2aType as A2AType)) {
            return err(`Invalid A2A type: ${a2aType}`);
          }
          const id = await a2aService.createA2A({
            type: a2aType as A2AType,
            createdBy: agentId,
            description: desc,
            ...(target_task_id !== undefined ? { targetTaskId: target_task_id } : {}),
          });
          return ok(`A2A task created: ${id}`);
        } catch (error: unknown) {
          return err(error instanceof Error ? error.message : 'Failed to create A2A task');
        }
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
    {
      name: 'resolve_a2a',
      description:
        'Resolve an A2A coordination task. Call this when you have finished processing an A2A task.',
      inputSchema: {
        type: 'object',
        properties: {
          a2a_id: { type: 'string', description: 'The A2A task ID to resolve' },
        },
        required: ['a2a_id'],
      },
      async handler(input: unknown): Promise<ToolResult> {
        try {
          const { a2a_id } = input as { a2a_id: string };
          await a2aService.resolveA2A(a2a_id, agentId);
          return ok(`A2A task ${a2a_id} resolved.`);
        } catch (error: unknown) {
          return err(error instanceof Error ? error.message : 'Failed to resolve A2A task');
        }
      },
    },
    {
      name: 'list_a2a',
      description:
        'List all A2A coordination tasks with their ID, type, and status.',
      inputSchema: { type: 'object', properties: {} },
      async handler(): Promise<ToolResult> {
        try {
          const ids = await a2aService.listA2A();
          if (ids.length === 0) {
            return ok('No A2A tasks found.');
          }

          const summaries: string[] = [];
          for (const id of ids) {
            try {
              const markdown = await a2aService.readA2A(id);
              const status = extractA2AStatusFromMarkdown(markdown) ?? 'unknown';
              summaries.push(`- ${id}: (${status})`);
            } catch {
              summaries.push(`- ${id}: (error reading)`);
            }
          }
          return ok(summaries.join('\n'));
        } catch (error: unknown) {
          return err(error instanceof Error ? error.message : 'Failed to list A2A tasks');
        }
      },
    },
    {
      name: 'check_consent',
      description:
        'Check the consent status of an A2A task. Returns the voting outcome (accepted/rejected/pending) with vote counts.',
      inputSchema: {
        type: 'object',
        properties: {
          a2a_id: { type: 'string', description: 'The A2A task ID to check' },
        },
        required: ['a2a_id'],
      },
      async handler(input: unknown): Promise<ToolResult> {
        try {
          const { a2a_id } = input as { a2a_id: string };
          const result = await consentService.checkConsent(a2a_id);
          return ok(JSON.stringify(result));
        } catch (error: unknown) {
          return err(error instanceof Error ? error.message : 'Failed to check consent');
        }
      },
    },
  ];
}
