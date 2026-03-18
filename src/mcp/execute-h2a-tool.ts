import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { TaskService } from '../tasks/task-service.js';
import type { H2APayload } from '../tasks/h2a-actions.js';
import { parseH2AContextBundle } from '../tasks/h2a-actions.js';
import { extractContextBundleFromMarkdown } from '../tasks/task-markdown.js';
import { InvalidH2AActionError } from '../shared/errors.js';
import type { ToolHandler } from './mcp-server.js';
import type { RegisterToolResult } from './client-registration.js';

export function createExecuteH2ATool(taskService: TaskService): RegisterToolResult {
  const definition: Tool = {
    name: 'execute_h2a',
    description:
      'Validate and execute an H2A (Human-to-Agent) command task. "valid" executes immediately. "conflict" flags an issue and requires human confirmation via TUI — then re-call with "confirmed" to execute after human input.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'H2A task ID (e.g. T-005)' },
        client_id: {
          type: 'string',
          description: 'Your client ID from register(). Must match the assigned_to field.',
        },
        validation_result: {
          type: 'string',
          enum: ['valid', 'conflict', 'confirmed'],
          description:
            '"valid" = validated and safe, execute immediately. "conflict" = flag an issue, needs human input. "confirmed" = human has confirmed via TUI after conflict, execute now.',
        },
        conflict_description: {
          type: 'string',
          description: 'Required when validation_result is "conflict". Describes the issue.',
        },
      },
      required: ['task_id', 'client_id', 'validation_result'],
    },
  };

  const handler: ToolHandler = async (args): Promise<CallToolResult> => {
    const taskId = typeof args.task_id === 'string' ? args.task_id : '';
    const clientId = typeof args.client_id === 'string' ? args.client_id : '';
    const validationResult = typeof args.validation_result === 'string' ? args.validation_result : '';
    const conflictDescription =
      typeof args.conflict_description === 'string' ? args.conflict_description : undefined;

    const taskMarkdown = await taskService.readTask(taskId);
    const contextBundle = extractContextBundleFromMarkdown(taskMarkdown);
    const payload = parseH2AContextBundle(contextBundle);

    if (!payload) {
      throw new InvalidH2AActionError('Could not parse H2A payload from task context bundle');
    }

    if (validationResult === 'conflict') {
      const description = conflictDescription ?? 'No description provided';
      await taskService.handleHumanInput(taskId, `Conflict flagged by ${clientId}: ${description}`);
      await taskService.appendTaskLog(taskId, clientId, `h2a conflict: ${description}`);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ ok: true, action: 'conflict_flagged', needs_human: true }),
          },
        ],
      };
    }

    if (validationResult === 'confirmed') {
      // Phase 2: Human has confirmed via TUI — verify ### Human Input exists
      if (!taskMarkdown.includes('### Human Input')) {
        throw new InvalidH2AActionError(
          'Cannot execute confirmed H2A without human input. The task must go through TUI confirmation first.',
        );
      }

      await executeH2AAction(taskService, payload);
      await taskService.appendTaskLog(
        taskId,
        clientId,
        `h2a executed: ${payload.action} on ${payload.targetId}`,
      );
      await taskService.updateStatus(taskId, 'done', clientId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: true,
              action: payload.action,
              target_id: payload.targetId,
              status: 'done',
            }),
          },
        ],
      };
    }

    // valid — agent is confident, execute immediately
    await executeH2AAction(taskService, payload);
    await taskService.appendTaskLog(
      taskId,
      clientId,
      `h2a executed: ${payload.action} on ${payload.targetId}`,
    );
    await taskService.updateStatus(taskId, 'done', clientId);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: true,
            action: payload.action,
            target_id: payload.targetId,
            status: 'done',
          }),
        },
      ],
    };
  };

  return { definition, handler };
}

async function executeH2AAction(taskService: TaskService, payload: H2APayload): Promise<void> {
  // Each H2A action maps to a TaskService operation.
  // New actions are added here as the H2A_ACTIONS array grows.
  const actions: Record<string, () => Promise<void>> = {
    delete_task: () => taskService.deleteTask(payload.targetId),
  };

  const fn = actions[payload.action];
  if (!fn) {
    throw new InvalidH2AActionError(payload.action);
  }
  await fn();
}
