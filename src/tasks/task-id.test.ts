import { describe, it, expect } from 'vitest';
import { generateTaskId, generateUniqueTaskId } from './task-id.js';
import { TaskIdCollisionError } from '../shared/errors.js';

describe('generateTaskId', () => {
  it('should return an 8-character hex string', () => {
    const id = generateTaskId('Fix login bug');
    expect(id).toMatch(/^[0-9a-f]{8}$/);
  });

  it('should produce different IDs for different inputs', () => {
    const id1 = generateTaskId('Task A');
    const id2 = generateTaskId('Task B');
    expect(id1).not.toBe(id2);
  });
});

describe('generateUniqueTaskId', () => {
  it('should return an 8-character hex string', () => {
    const id = generateUniqueTaskId('My task', []);
    expect(id).toMatch(/^[0-9a-f]{8}$/);
  });

  it('should avoid collisions with existing IDs', () => {
    const first = generateUniqueTaskId('Task', []);
    const second = generateUniqueTaskId('Task', [first]);
    expect(second).not.toBe(first);
    expect(second).toMatch(/^[0-9a-f]{8}$/);
  });

  it('should throw TaskIdCollisionError when all retries are exhausted', () => {
    expect(new TaskIdCollisionError('test')).toBeInstanceOf(TaskIdCollisionError);
  });
});
