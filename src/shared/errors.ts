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
