import { execFile } from 'node:child_process';
import type { GitServiceInterface, MergeResult } from './git-interface.js';
import { GitNotAvailableError, WorktreeError } from '../shared/errors.js';

function exec(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

export class GitService implements GitServiceInterface {
  constructor(private readonly cwd: string) {}

  async createWorktree(branchName: string, worktreePath: string): Promise<void> {
    try {
      await exec(['worktree', 'add', '-b', branchName, worktreePath], this.cwd);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('not a git repository')) {
        throw new GitNotAvailableError();
      }
      throw new WorktreeError(`Failed to create worktree: ${message}`);
    }
  }

  async removeWorktree(worktreePath: string): Promise<void> {
    try {
      await exec(['worktree', 'remove', worktreePath, '--force'], this.cwd);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new WorktreeError(`Failed to remove worktree: ${message}`);
    }
  }

  async mergeBranch(branchName: string): Promise<MergeResult> {
    try {
      await exec(['merge', '--no-ff', branchName, '-m', `Merge ${branchName}`], this.cwd);
      return { success: true, conflictFiles: [] };
    } catch {
      const conflictFiles = await this.getConflictFiles();
      await exec(['merge', '--abort'], this.cwd).catch(() => {});
      return { success: false, conflictFiles };
    }
  }

  async deleteBranch(branchName: string): Promise<void> {
    await exec(['branch', '-D', branchName], this.cwd);
  }

  async getCurrentBranch(): Promise<string> {
    try {
      return await exec(['rev-parse', '--abbrev-ref', 'HEAD'], this.cwd);
    } catch {
      throw new GitNotAvailableError();
    }
  }

  async hasUncommittedChanges(): Promise<boolean> {
    const output = await exec(['status', '--porcelain'], this.cwd);
    return output.length > 0;
  }

  private async getConflictFiles(): Promise<string[]> {
    try {
      const output = await exec(['diff', '--name-only', '--diff-filter=U'], this.cwd);
      return output.split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }
}
