import type { StorageInterface } from '../storage/storage-interface.js';
import type { LogService } from '../logs/log-service.js';
import type { A2AService } from '../a2a/a2a-service.js';
import type { StoryService } from '../story/story-service.js';
import { StorageReadError } from '../shared/errors.js';
import { buildTaskMarkdown, type TaskMarkdownFields } from './task-markdown.js';
import type { TaskStatus, TaskType } from './task-types.js';

export interface RecoveryResult {
  success: boolean;
  source: 'agent_memory' | 'log' | 'story' | 'none';
  taskId: string;
  reconstructedMarkdown?: string;
  a2aId?: string;
  message: string;
}

export class FileRecoveryService {
  constructor(
    private readonly storage: StorageInterface,
    private readonly logService: LogService,
    private readonly a2aService: A2AService,
    private readonly storyService: StoryService,
  ) {}

  async recoverTask(
    taskId: string,
    agentId: string,
    agentMemory?: string,
  ): Promise<RecoveryResult> {
    // If file already exists, no recovery needed
    try {
      await this.storage.readTask(taskId);
      return {
        success: true,
        source: 'agent_memory',
        taskId,
        message: 'Task file already exists, no recovery needed.',
      };
    } catch (error: unknown) {
      if (!(error instanceof StorageReadError)) throw error;
    }

    // 1. Agent memory path
    if (agentMemory && agentMemory.trim().length > 0) {
      await this.storage.writeTask(taskId, agentMemory);
      await this.logService.appendLog(
        taskId,
        agentId,
        `[RECOVERY] task.md reconstructed from agent memory by ${agentId}`,
      );
      return {
        success: true,
        source: 'agent_memory',
        taskId,
        reconstructedMarkdown: agentMemory,
        message: 'Task reconstructed from agent memory.',
      };
    }

    // 2. Log-based reconstruction
    const logContent = await this.logService.getLog(taskId);
    if (logContent.trim().length > 0) {
      const fields = this.parseLogForReconstruction(taskId, logContent);
      if (fields?.title) {
        const markdown = buildTaskMarkdown({
          id: taskId,
          title: fields.title,
          type: fields.type ?? 'chore',
          status: fields.status ?? 'open',
          assignedTo: fields.assignedTo,
          createdBy: fields.createdBy ?? 'unknown',
          createdAt: fields.createdAt ?? new Date().toISOString(),
          contextBundle: '[RECOVERED FROM LOG — context bundle unknown]',
        });
        await this.storage.writeTask(taskId, markdown);
        await this.logService.appendLog(
          taskId,
          agentId,
          `[RECOVERY] task.md reconstructed from log file by ${agentId}`,
        );
        return {
          success: true,
          source: 'log',
          taskId,
          reconstructedMarkdown: markdown,
          message: 'Task reconstructed from log file.',
        };
      }
    }

    // 3. Story-based reconstruction
    try {
      const storyContent = await this.storyService.getStory();
      const mentions = this.searchStoryForTask(taskId, storyContent);
      if (mentions.length > 0) {
        const description =
          `Task file ${taskId} is missing. Found ${mentions.length} mention(s) in story.md:\n\n` +
          mentions.map((l) => `> ${l}`).join('\n') +
          '\n\nHuman review required to reconstruct the task.';
        const a2aId = await this.a2aService.createA2A({
          type: 'file_missing',
          createdBy: agentId,
          targetTaskId: taskId,
          description,
        });
        return {
          success: false,
          source: 'story',
          taskId,
          a2aId,
          message: `Partial context found in story.md (${mentions.length} mention(s)). Human review required. A2A task created: ${a2aId}`,
        };
      }
    } catch {
      // story.md not readable — continue to fallback
    }

    // 4. No context — warn human
    const a2aId = await this.a2aService.createA2A({
      type: 'file_missing',
      createdBy: agentId,
      targetTaskId: taskId,
      description: `Task file ${taskId} is missing and no reconstruction context was found (no log entries, no story mentions). Human must recreate task-${taskId} manually.`,
    });
    return {
      success: false,
      source: 'none',
      taskId,
      a2aId,
      message: `No context available for reconstruction. Human must recreate task-${taskId}. A2A task created: ${a2aId}`,
    };
  }

  parseLogForReconstruction(
    _taskId: string,
    logContent: string,
  ): Partial<TaskMarkdownFields> | null {
    const lines = logContent
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return null;

    // Log format: [YYYY-MM-DD HH:MM:SS] agentId | message
    const linePattern = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] ([^\|]+) \| (.+)$/;

    let title: string | undefined;
    let createdBy: string | undefined;
    let createdAt: string | undefined;
    let status: TaskStatus | undefined;
    let assignedTo: string | undefined;

    for (const line of lines) {
      const match = linePattern.exec(line);
      if (!match) continue;
      const [, timestamp, agent, message] = match;

      // created task: {title}
      const createdMatch = /^created task: (.+)$/.exec(message);
      if (createdMatch && !title) {
        title = createdMatch[1].trim();
        createdBy = agent.trim();
        createdAt = timestamp.replace(' ', 'T') + ':00.000Z';
      }

      // status: X → Y
      const statusMatch = /status: \S+ → (\S+)/.exec(message);
      if (statusMatch) {
        status = statusMatch[1] as TaskStatus;
      }

      // claimed task
      const claimedMatch = /^claimed task/.exec(message);
      if (claimedMatch) {
        assignedTo = agent.trim();
      }
    }

    if (!title) return null;

    return { title, createdBy, createdAt, status, assignedTo };
  }

  searchStoryForTask(taskId: string, storyContent: string): string[] {
    return storyContent
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.includes(taskId));
  }
}
