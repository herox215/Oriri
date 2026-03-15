import { createHash } from 'node:crypto';
import { TaskIdCollisionError } from '../shared/errors.js';

export function generateTaskId(createdBy: string, title: string): string {
  const input = `${createdBy}:${String(Date.now())}:${title}`;
  const hash = createHash('sha256').update(input).digest('hex');
  return hash.slice(0, 8);
}

export function generateUniqueTaskId(
  createdBy: string,
  title: string,
  existingIds: string[],
  maxRetries = 5,
): string {
  const existing = new Set(existingIds);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const salt = attempt > 0 ? `:${String(attempt)}:${String(Date.now())}` : '';
    const input = `${createdBy}:${String(Date.now())}:${title}${salt}`;
    const hash = createHash('sha256').update(input).digest('hex');
    const id = hash.slice(0, 8);

    if (!existing.has(id)) {
      return id;
    }
  }

  throw new TaskIdCollisionError(
    `Could not generate unique ID after ${String(maxRetries)} retries`,
  );
}
