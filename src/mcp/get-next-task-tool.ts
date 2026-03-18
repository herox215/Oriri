import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { TaskService } from '../tasks/task-service.js';
import type { AgentRegistry } from '../agents/agent-registry.js';
import type { AgentRole } from '../config/config-types.js';
import {
  extractStatusFromMarkdown,
  extractTypeFromMarkdown,
  extractAssignedToFromMarkdown,
} from '../tasks/task-markdown.js';
import { getPermissionsForRole } from '../agents/role-permissions.js';
import type { ToolHandler } from './mcp-server.js';
import type { RegisterToolResult } from './client-registration.js';

async function resolveRole(registry: AgentRegistry, clientId?: string): Promise<AgentRole> {
  if (!clientId) return 'MCP_CLIENT';
  const agents = await registry.listAgents();
  return agents.find((a) => a.id === clientId)?.role ?? 'MCP_CLIENT';
}

export function createGetNextTaskTool(
  taskService: TaskService,
  registry: AgentRegistry,
): RegisterToolResult {
  const definition: Tool = {
    name: 'get_next_task',
    description:
      'Find the next claimable task for this client based on role and optional capabilities filter.',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: {
          type: 'string',
          description: 'Your client ID from register(). Used to look up your role.',
        },
        capabilities: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional list of capability keywords. Only tasks whose content contains at least one keyword are returned.',
        },
      },
    },
  };

  const handler: ToolHandler = async (args): Promise<CallToolResult> => {
    const clientId = typeof args.client_id === 'string' ? args.client_id : undefined;
    const capabilities = Array.isArray(args.capabilities)
      ? (args.capabilities as string[])
      : undefined;

    const role = await resolveRole(registry, clientId);
    const permissions = getPermissionsForRole(role);
    const { claimableTypes, claimableStatuses } = permissions.tasks;

    if (claimableTypes.length === 0 || claimableStatuses.length === 0) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ message: 'No claimable tasks found' }) }],
      };
    }

    const ids = await taskService.listTasks();

    for (const id of ids) {
      const taskMarkdown = await taskService.readTask(id);

      const status = extractStatusFromMarkdown(taskMarkdown);
      const type = extractTypeFromMarkdown(taskMarkdown);
      const assignedTo = extractAssignedToFromMarkdown(taskMarkdown);

      if (!status || !type) continue;
      if (!claimableStatuses.includes(status as never)) continue;
      if (!claimableTypes.includes(type as never)) continue;
      if (assignedTo !== null && assignedTo !== '—') continue;

      if (capabilities && capabilities.length > 0) {
        const lower = taskMarkdown.toLowerCase();
        const matches = capabilities.some((cap) => lower.includes(cap.toLowerCase()));
        if (!matches) continue;
      }

      const log = await taskService.getTaskLog(id);
      const text = `## Task\n\n${taskMarkdown}\n\n## Log\n\n${log}`;
      return { content: [{ type: 'text', text }] };
    }

    return {
      content: [{ type: 'text', text: JSON.stringify({ message: 'No claimable tasks found' }) }],
    };
  };

  return { definition, handler };
}
