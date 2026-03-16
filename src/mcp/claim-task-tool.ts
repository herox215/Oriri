import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { TaskService } from '../tasks/task-service.js';
import type { AgentRegistry } from '../agents/agent-registry.js';
import type { RoleService } from '../agents/role-service.js';
import type { AgentRole } from '../config/config-types.js';
import type { ToolHandler } from './mcp-server.js';
import type { RegisterToolResult } from './client-registration.js';

async function resolveRole(registry: AgentRegistry, clientId?: string): Promise<AgentRole> {
  if (!clientId) return 'MCP_CLIENT';
  const agents = await registry.listAgents();
  return agents.find((a) => a.id === clientId)?.role ?? 'MCP_CLIENT';
}

export function createClaimTaskTool(
  taskService: TaskService,
  registry: AgentRegistry,
  _roleService: RoleService,
): RegisterToolResult {
  const definition: Tool = {
    name: 'claim_task',
    description: 'Claim an open task. Sets status to planning and assigns it to you.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Task ID to claim (e.g. T-001)' },
        client_id: {
          type: 'string',
          description: 'Your client ID from register(). Used to look up your role.',
        },
      },
      required: ['id'],
    },
  };

  const handler: ToolHandler = async (args): Promise<CallToolResult> => {
    const id = typeof args.id === 'string' ? args.id : '';
    const clientId = typeof args.client_id === 'string' ? args.client_id : undefined;

    const role = await resolveRole(registry, clientId);
    const agentId = clientId ?? 'mcp-anonymous';

    await taskService.claimTask(id, agentId, role);

    return { content: [{ type: 'text', text: JSON.stringify({ ok: true, id }) }] };
  };

  return { definition, handler };
}
