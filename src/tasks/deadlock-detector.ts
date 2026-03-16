import type { StorageInterface } from '../storage/storage-interface.js';
import type { TaskService } from './task-service.js';
import type { LogService } from '../logs/log-service.js';
import { extractStatusFromMarkdown } from './task-markdown.js';
import { replaceStatusInMarkdown } from './task-markdown.js';
import { buildDependencyGraph, findCycles } from './dependency-graph.js';
import { buildA2AMarkdown } from '../a2a/a2a-markdown.js';
import { extractA2AStatusFromMarkdown, extractA2ATypeFromMarkdown } from '../a2a/a2a-markdown.js';
import { generateA2AId } from '../a2a/a2a-id.js';

export interface DeadlockDetectorDeps {
  storage: StorageInterface;
  taskService: TaskService;
  logService: LogService;
}

export class DeadlockDetector {
  constructor(private readonly deps: DeadlockDetectorDeps) {}

  async checkBlockedTasks(agentId: string): Promise<string[]> {
    const { taskService, logService, storage } = this.deps;
    const updatedTaskIds: string[] = [];

    const ids = await taskService.listTasks();
    const taskMarkdowns = new Map<string, string>();

    for (const id of ids) {
      try {
        taskMarkdowns.set(id, await taskService.readTask(id));
      } catch {
        continue;
      }
    }

    const graph = buildDependencyGraph(taskMarkdowns);

    for (const [id, markdown] of taskMarkdowns) {
      const status = extractStatusFromMarkdown(markdown);
      if (!status || status === 'done' || status === 'waiting_for_agent') continue;

      const deps = graph.get(id) ?? [];
      if (deps.length === 0) continue;

      const isBlocked = deps.some((depId) => {
        const depMarkdown = taskMarkdowns.get(depId);
        if (!depMarkdown) return false;
        return extractStatusFromMarkdown(depMarkdown) !== 'done';
      });

      if (isBlocked) {
        const updated = replaceStatusInMarkdown(markdown, 'waiting_for_agent');
        await storage.writeTask(id, updated);
        await logService.appendLog(
          id,
          agentId,
          `status: ${status} → waiting_for_agent (blocked by unfinished dependency)`,
        );
        updatedTaskIds.push(id);
      }
    }

    return updatedTaskIds;
  }

  async checkDeadlocks(agentId: string): Promise<string[]> {
    const { taskService, logService, storage } = this.deps;
    const createdA2AIds: string[] = [];

    const ids = await taskService.listTasks();
    const taskMarkdowns = new Map<string, string>();

    for (const id of ids) {
      try {
        taskMarkdowns.set(id, await taskService.readTask(id));
      } catch {
        continue;
      }
    }

    const graph = buildDependencyGraph(taskMarkdowns);
    const cycles = findCycles(graph);

    if (cycles.length === 0) return [];

    const existingA2AIds = await storage.listA2A();
    const openDeadlockA2As = new Set<string>();

    for (const a2aId of existingA2AIds) {
      try {
        const a2aMd = await storage.readA2A(a2aId);
        const a2aStatus = extractA2AStatusFromMarkdown(a2aMd);
        const a2aType = extractA2ATypeFromMarkdown(a2aMd);
        if (a2aStatus === 'open' && a2aType === 'deadlock_detected') {
          openDeadlockA2As.add(a2aId);
        }
      } catch {
        continue;
      }
    }

    // Only create one A2A per run if open deadlock A2As already exist (idempotent)
    if (openDeadlockA2As.size > 0) return [];

    for (const cycle of cycles) {
      const a2aId = generateA2AId(agentId, 'deadlock_detected', [
        ...existingA2AIds,
        ...createdA2AIds,
      ]);
      const cycleDescription = cycle.join(' → ') + ` → ${cycle[0] ?? '?'}`;
      const a2aMarkdown = buildA2AMarkdown({
        id: a2aId,
        type: 'deadlock_detected',
        status: 'open',
        createdBy: agentId,
        createdAt: new Date().toISOString(),
        description: `Circular dependency detected: ${cycleDescription}. Resolve by removing one of the dependencies.`,
      });

      await storage.writeA2A(a2aId, a2aMarkdown);

      // TODO (T-014): Gate resolution behind A2A consent once voting is implemented.
      // For now, the A2A task is created and the cycle must be resolved manually.

      for (const taskId of cycle) {
        try {
          await logService.appendLog(
            taskId,
            agentId,
            `deadlock detected in dependency cycle: ${cycleDescription} (via a2a-${a2aId})`,
          );
        } catch {
          continue;
        }
      }

      createdA2AIds.push(a2aId);
    }

    return createdA2AIds;
  }
}
