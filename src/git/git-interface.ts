export interface MergeResult {
  success: boolean;
  conflictFiles: string[];
}

export interface GitServiceInterface {
  createWorktree(branchName: string, worktreePath: string): Promise<void>;
  removeWorktree(worktreePath: string): Promise<void>;
  mergeBranch(branchName: string): Promise<MergeResult>;
  deleteBranch(branchName: string): Promise<void>;
  getCurrentBranch(): Promise<string>;
  hasUncommittedChanges(): Promise<boolean>;
}
