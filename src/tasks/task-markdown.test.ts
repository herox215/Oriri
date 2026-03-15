import { describe, it, expect } from 'vitest';
import {
  buildTaskMarkdown,
  extractAssignedToFromMarkdown,
  extractTypeFromMarkdown,
  replaceAssignedToInMarkdown,
} from './task-markdown.js';

describe('task-markdown helpers', () => {
  const sampleMarkdown = buildTaskMarkdown({
    id: 'abcd1234',
    title: 'Test task',
    type: 'feature',
    status: 'open',
    createdBy: 'agent-alpha',
    createdAt: '2026-03-15T10:00:00.000Z',
  });

  describe('extractTypeFromMarkdown', () => {
    it('should extract the task type', () => {
      expect(extractTypeFromMarkdown(sampleMarkdown)).toBe('feature');
    });

    it('should return null for malformed markdown', () => {
      expect(extractTypeFromMarkdown('no table here')).toBeNull();
    });
  });

  describe('extractAssignedToFromMarkdown', () => {
    it('should return em dash for unassigned task', () => {
      expect(extractAssignedToFromMarkdown(sampleMarkdown)).toBe('—');
    });

    it('should return agent ID for assigned task', () => {
      const assigned = replaceAssignedToInMarkdown(sampleMarkdown, 'agent-beta');
      expect(extractAssignedToFromMarkdown(assigned)).toBe('agent-beta');
    });

    it('should return null for malformed markdown', () => {
      expect(extractAssignedToFromMarkdown('no table here')).toBeNull();
    });
  });

  describe('replaceAssignedToInMarkdown', () => {
    it('should replace em dash with agent ID', () => {
      const result = replaceAssignedToInMarkdown(sampleMarkdown, 'agent-beta');
      expect(result).toContain('| assigned_to | agent-beta |');
      expect(result).not.toContain('| assigned_to | — |');
    });

    it('should replace existing agent ID with new one', () => {
      const first = replaceAssignedToInMarkdown(sampleMarkdown, 'agent-beta');
      const second = replaceAssignedToInMarkdown(first, 'agent-gamma');
      expect(second).toContain('| assigned_to | agent-gamma |');
      expect(second).not.toContain('agent-beta');
    });
  });
});
