import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { TaskService } from '../tasks/task-service.js';
import type { AgentRegistry } from '../agents/agent-registry.js';
import type { RoleService } from '../agents/role-service.js';
import type { AgentRole } from '../config/config-types.js';
import type { TaskType } from '../tasks/task-types.js';
import { TASK_TYPES } from '../tasks/task-types.js';
import type { StoryService } from '../story/story-service.js';
import type { ToolHandler } from './mcp-server.js';
import type { RegisterToolResult } from './client-registration.js';

async function resolveRole(registry: AgentRegistry, clientId?: string): Promise<AgentRole> {
  if (!clientId) return 'MCP_CLIENT';
  const agents = await registry.listAgents();
  return agents.find((a) => a.id === clientId)?.role ?? 'MCP_CLIENT';
}

export function createCreateTaskTool(
  taskService: TaskService,
  registry: AgentRegistry,
  roleService: RoleService,
  storyService?: StoryService,
): RegisterToolResult {
  const definition: Tool = {
    name: 'create_task',
    description: 'Create a new task. Requires a role that has task creation permission.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short title for the task' },
        type: {
          type: 'string',
          enum: [...TASK_TYPES],
          description: 'Task type: feature, bug, chore, or escalation',
        },
        client_id: {
          type: 'string',
          description: 'Your client ID from register(). Used to look up your role.',
        },
        context: {
          type: 'string',
          description: 'Optional context bundle providing background for the task',
        },
        created_by: {
          type: 'string',
          description: 'Identity of the creator (user or agent name). Falls back to client_id, then mcp-anonymous.',
        },
        dependencies: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of task IDs this task depends on',
        },
      },
      required: ['title', 'type'],
    },
  };

  const handler: ToolHandler = async (args): Promise<CallToolResult> => {
    const title = typeof args.title === 'string' ? args.title : '';
    const type = typeof args.type === 'string' ? (args.type as TaskType) : 'feature';
    const clientId = typeof args.client_id === 'string' ? args.client_id : undefined;
    const context = typeof args.context === 'string' ? args.context : undefined;
    const dependencies = Array.isArray(args.dependencies)
      ? (args.dependencies as string[])
      : undefined;

    const role = await resolveRole(registry, clientId);
    roleService.checkCanCreateTask(role);

    const explicitCreatedBy = typeof args.created_by === 'string' ? args.created_by : undefined;
    const createdBy = explicitCreatedBy ?? clientId ?? 'mcp-anonymous';
    const id = await taskService.createTask({
      title,
      type,
      createdBy,
      contextBundle: context,
      dependencies,
    });

    try {
      if (storyService) {
        const role = await resolveRole(registry, clientId);
        await storyService.appendStory(createdBy, role, `Task ${id} created: ${title}`);
      }
    } catch {
      // Story write failure should not block task creation
    }

    return { content: [{ type: 'text', text: JSON.stringify({ id }) }] };
  };

  return { definition, handler };
}
