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
