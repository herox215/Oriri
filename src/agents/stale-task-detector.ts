import type { StorageInterface } from '../storage/storage-interface.js';
import type { TaskService } from '../tasks/task-service.js';
import type { LogService } from '../logs/log-service.js';
import type { AgentRegistry } from './agent-registry.js';
import type { TaskStatus } from '../tasks/task-types.js';
import { AgentNotFoundError } from '../shared/errors.js';
import {
  extractStatusFromMarkdown,
  extractAssignedToFromMarkdown,
  replaceStatusInMarkdown,
  clearAssignedToInMarkdown,
} from '../tasks/task-markdown.js';
import { buildA2AMarkdown } from '../a2a/a2a-markdown.js';
import {
  extractA2AStatusFromMarkdown,
  extractA2ATargetTaskFromMarkdown,
} from '../a2a/a2a-markdown.js';
import { generateA2AId } from '../a2a/a2a-id.js';

const NON_STALE_STATUSES: ReadonlySet<string> = new Set<TaskStatus>([
  'done',
  'waiting_for_agent',
  'open',
]);

export interface StaleTaskInfo {
  taskId: string;
  assignedTo: string;
  lastLogTimestamp: Date | null;
  status: string;
}

export interface StaleTaskDetectorDeps {
  storage: StorageInterface;
  taskService: TaskService;
  logService: LogService;
  registry: AgentRegistry;
}

export function parseLastLogTimestamp(logContent: string): Date | null {
  const lines = logContent.trimEnd().split('\n');

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line) continue;
    const match = /\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/.exec(line);
    if (match?.[1] !== undefined) {
      const date = new Date(match[1].replace(' ', 'T') + 'Z');
      if (!isNaN(date.getTime())) return date;
    }
  }

  return null;
}

export class StaleTaskDetector {
  constructor(private readonly deps: StaleTaskDetectorDeps) {}

  async findStaleTasks(thresholdMs: number): Promise<StaleTaskInfo[]> {
    const { taskService, logService } = this.deps;
    const now = Date.now();
    const staleTasks: StaleTaskInfo[] = [];

    const ids = await taskService.listTasks();

    for (const id of ids) {
      try {
        const markdown = await taskService.readTask(id);
        const status = extractStatusFromMarkdown(markdown);
        if (!status || NON_STALE_STATUSES.has(status)) continue;

        const assignedTo = extractAssignedToFromMarkdown(markdown);
        if (!assignedTo || assignedTo === '—') continue;

        const log = await logService.getLog(id);
        const lastTimestamp = parseLastLogTimestamp(log);

        if (lastTimestamp === null || now - lastTimestamp.getTime() > thresholdMs) {
          staleTasks.push({ taskId: id, assignedTo, lastLogTimestamp: lastTimestamp, status });
        }
      } catch {
        continue;
      }
    }

    return staleTasks;
  }

  async handleStaleTask(staleTask: StaleTaskInfo, detectingAgentId: string): Promise<string> {
    const { storage, taskService, logService, registry } = this.deps;

    // Check for existing unresolved agent_silent A2A for the same task
    const existingA2AIds = await storage.listA2A();
    for (const a2aId of existingA2AIds) {
      try {
        const a2aMd = await storage.readA2A(a2aId);
        const a2aStatus = extractA2AStatusFromMarkdown(a2aMd);
        const targetTask = extractA2ATargetTaskFromMarkdown(a2aMd);
        if (a2aStatus === 'open' && targetTask === staleTask.taskId) {
          // Already an open agent_silent for this task — skip
          return a2aId;
        }
      } catch {
        continue;
      }
    }

    // Create A2A agent_silent task
    const a2aId = generateA2AId(detectingAgentId, 'agent_silent', existingA2AIds);
    const a2aMarkdown = buildA2AMarkdown({
      id: a2aId,
      type: 'agent_silent',
      status: 'open',
      createdBy: detectingAgentId,
      createdAt: new Date().toISOString(),
      targetTaskId: staleTask.taskId,
      targetAgentId: staleTask.assignedTo,
      description: `Agent ${staleTask.assignedTo} has not updated task ${staleTask.taskId} (status: ${staleTask.status}) for over the configured threshold. Task will be reset to open.`,
    });
    await storage.writeA2A(a2aId, a2aMarkdown);

    // Reset task: status → open, clear assigned_to
    // TODO (T-014): Gate this behind A2A consent once voting is implemented
    const taskMd = await taskService.readTask(staleTask.taskId);
    let updated = replaceStatusInMarkdown(taskMd, 'open');
    updated = clearAssignedToInMarkdown(updated);
    await storage.writeTask(staleTask.taskId, updated);

    await logService.appendLog(
      staleTask.taskId,
      detectingAgentId,
      `stale task detected — reset to open, removed ${staleTask.assignedTo} (via a2a-${a2aId})`,
    );

    // Remove stale agent from active.md (if still listed)
    try {
      await registry.deregister(staleTask.assignedTo);
    } catch (error: unknown) {
      if (!(error instanceof AgentNotFoundError)) throw error;
    }

    return a2aId;
  }
}
