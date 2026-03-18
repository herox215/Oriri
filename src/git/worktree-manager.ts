import type { GitServiceInterface } from './git-interface.js';
import type { TaskService } from '../tasks/task-service.js';
import {
  TaskAlreadyStartedError,
  UncommittedChangesError,
  MergeConflictError,
  WorktreeError,
} from '../shared/errors.js';

export interface StartTaskResult {
  worktreePath: string;
  branch: string;
  baseBranch: string;
}

export interface FinishTaskResult {
  ok: boolean;
  conflictFiles?: string[];
}

export class WorktreeManager {
  constructor(
    private readonly git: GitServiceInterface,
    private readonly taskService: TaskService,
    private readonly projectRoot: string,
  ) {}

  async startTask(taskId: string): Promise<StartTaskResult> {
    const details = await this.taskService.getTaskDetails(taskId);

    if (details.status !== 'open') {
      throw new TaskAlreadyStartedError(taskId);
    }

    if (await this.git.hasUncommittedChanges()) {
      throw new UncommittedChangesError();
    }

    const baseBranch = await this.git.getCurrentBranch();
    const branch = `oriri/task-${taskId}`;
    const worktreePath = `${this.projectRoot}-worktrees/task-${taskId}`;

    await this.git.createWorktree(branch, worktreePath);
    await this.taskService.startTask(taskId, branch, worktreePath);

    return { worktreePath, branch, baseBranch };
  }

  async finishTask(taskId: string): Promise<FinishTaskResult> {
    const details = await this.taskService.getTaskDetails(taskId);

    if (details.status !== 'in_progress') {
      throw new WorktreeError(`Task ${taskId} is not in progress`);
    }

    const branch = details.branch;
    const worktreePath = details.worktreePath;

    if (!branch || !worktreePath) {
      throw new WorktreeError(`Task ${taskId} is missing branch or worktree metadata`);
    }

    await this.git.removeWorktree(worktreePath);

    const result = await this.git.mergeBranch(branch);

    if (!result.success) {
      throw new MergeConflictError(result.conflictFiles);
    }

    await this.git.deleteBranch(branch);
    await this.taskService.completeTask(taskId);

    return { ok: true };
  }
}
