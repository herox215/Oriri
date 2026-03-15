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
