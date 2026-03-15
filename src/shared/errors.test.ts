import { describe, it, expect } from 'vitest';
import { OririError } from './errors.js';

describe('OririError', () => {
  it('should create an error with message and code', () => {
    const error = new OririError('something went wrong', 'TEST_ERROR');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(OririError);
    expect(error.message).toBe('something went wrong');
    expect(error.code).toBe('TEST_ERROR');
    expect(error.name).toBe('OririError');
  });
});
