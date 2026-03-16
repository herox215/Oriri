export class OririError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'OririError';
  }
}

export class InitError extends OririError {
  constructor(message: string, code = 'INIT_ALREADY_EXISTS') {
    super(message, code);
    this.name = 'InitError';
  }
}

export class StorageReadError extends OririError {
  constructor(entity: string) {
    super(`${entity} not found`, 'STORAGE_READ_FAILED');
    this.name = 'StorageReadError';
  }
}

export class StorageWriteError extends OririError {
  constructor(entity: string) {
    super(`Failed to write ${entity}`, 'STORAGE_WRITE_FAILED');
    this.name = 'StorageWriteError';
  }
}

export class ConfigNotFoundError extends OririError {
  constructor(path: string) {
    super(`Config file not found: ${path}`, 'CONFIG_NOT_FOUND');
    this.name = 'ConfigNotFoundError';
  }
}

export class ConfigValidationError extends OririError {
  constructor(message: string) {
    super(message, 'CONFIG_VALIDATION_FAILED');
    this.name = 'ConfigValidationError';
  }
}

export class TaskNotFoundError extends OririError {
  constructor(id: string) {
    super(`Task ${id} not found`, 'TASK_NOT_FOUND');
    this.name = 'TaskNotFoundError';
  }
}

export class TaskIdCollisionError extends OririError {
  constructor(id: string) {
    super(`Task ID collision: ${id}`, 'TASK_ID_COLLISION');
    this.name = 'TaskIdCollisionError';
  }
}

export class InvalidTaskStatusError extends OririError {
  constructor(currentStatus: string, newStatus: string) {
    super(`Cannot transition from '${currentStatus}' to '${newStatus}'`, 'INVALID_TASK_STATUS');
    this.name = 'InvalidTaskStatusError';
  }
}

export class TaskAlreadyClaimedError extends OririError {
  constructor(taskId: string, assignedTo: string) {
    super(`Task ${taskId} is already claimed by ${assignedTo}`, 'TASK_ALREADY_CLAIMED');
    this.name = 'TaskAlreadyClaimedError';
  }
}

export class AgentNotFoundError extends OririError {
  constructor(id: string) {
    super(`Agent ${id} not found in active agents`, 'AGENT_NOT_FOUND');
    this.name = 'AgentNotFoundError';
  }
}

export class AgentAlreadyRegisteredError extends OririError {
  constructor(id: string) {
    super(`Agent ${id} is already registered`, 'AGENT_ALREADY_REGISTERED');
    this.name = 'AgentAlreadyRegisteredError';
  }
}

export class AgentConfigNotFoundError extends OririError {
  constructor(agentId: string) {
    super(`Agent config for "${agentId}" not found in config.yaml`, 'AGENT_CONFIG_NOT_FOUND');
    this.name = 'AgentConfigNotFoundError';
  }
}

export class LLMApiError extends OririError {
  constructor(message: string) {
    super(message, 'LLM_API_ERROR');
    this.name = 'LLMApiError';
  }
}

export class ToolExecutionError extends OririError {
  constructor(toolName: string, message: string) {
    super(`Tool "${toolName}" failed: ${message}`, 'TOOL_EXECUTION_ERROR');
    this.name = 'ToolExecutionError';
  }
}

export class StaleTaskDetectionError extends OririError {
  constructor(taskId: string, message: string) {
    super(`Stale detection failed for task ${taskId}: ${message}`, 'STALE_DETECTION_FAILED');
    this.name = 'StaleTaskDetectionError';
  }
}

export class A2ANotFoundError extends OririError {
  constructor(id: string) {
    super(`A2A task ${id} not found`, 'A2A_NOT_FOUND');
    this.name = 'A2ANotFoundError';
  }
}

export class InvalidA2ATypeError extends OririError {
  constructor(type: string) {
    super(`Invalid A2A type: ${type}`, 'INVALID_A2A_TYPE');
    this.name = 'InvalidA2ATypeError';
  }
}

export class DeadlockDetectionError extends OririError {
  constructor(message: string) {
    super(message, 'DEADLOCK_DETECTION_FAILED');
    this.name = 'DeadlockDetectionError';
  }
}

export class StoryArchiveError extends OririError {
  constructor(message: string) {
    super(message, 'STORY_ARCHIVE_FAILED');
    this.name = 'StoryArchiveError';
  }
}

export class PermissionDeniedError extends OririError {
  constructor(action: string, role: string, reason?: string) {
    const message = reason
      ? `Role '${role}' cannot ${action}: ${reason}`
      : `Role '${role}' cannot ${action}`;
    super(message, 'PERMISSION_DENIED');
    this.name = 'PermissionDeniedError';
  }
}

export class VoteAlreadyCastError extends OririError {
  constructor(agentId: string, a2aId: string) {
    super(`Agent ${agentId} has already voted on A2A task ${a2aId}`, 'VOTE_ALREADY_CAST');
    this.name = 'VoteAlreadyCastError';
  }
}

export class VoteNotAllowedError extends OririError {
  constructor(reason: string) {
    super(`Vote not allowed: ${reason}`, 'VOTE_NOT_ALLOWED');
    this.name = 'VoteNotAllowedError';
  }
}

export class WatcherError extends OririError {
  constructor(message: string) {
    super(message, 'WATCHER_ERROR');
    this.name = 'WatcherError';
  }
}

export class FileRecoveryError extends OririError {
  constructor(taskId: string, reason: string) {
    super(`Cannot recover task ${taskId}: ${reason}`, 'FILE_RECOVERY_FAILED');
    this.name = 'FileRecoveryError';
  }
}
