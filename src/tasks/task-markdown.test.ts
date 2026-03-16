import { describe, it, expect } from 'vitest';
import {
  buildTaskMarkdown,
  clearAssignedToInMarkdown,
  extractAssignedToFromMarkdown,
  extractTypeFromMarkdown,
  replaceAssignedToInMarkdown,
  replaceTypeInMarkdown,
  replaceContextBundleInMarkdown,
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

  describe('clearAssignedToInMarkdown', () => {
    it('should reset assigned_to to em dash', () => {
      const assigned = replaceAssignedToInMarkdown(sampleMarkdown, 'agent-beta');
      const cleared = clearAssignedToInMarkdown(assigned);
      expect(extractAssignedToFromMarkdown(cleared)).toBe('—');
    });
  });

  describe('replaceTypeInMarkdown', () => {
    it('should replace the task type', () => {
      const result = replaceTypeInMarkdown(sampleMarkdown, 'bug');
      expect(result).toContain('| type | bug |');
      expect(result).not.toContain('| type | feature |');
    });
  });

  describe('replaceContextBundleInMarkdown', () => {
    it('should replace empty context bundle', () => {
      const result = replaceContextBundleInMarkdown(sampleMarkdown, 'New context here');
      expect(result).toContain('## Context Bundle\n\nNew context here\n');
    });

    it('should replace existing context bundle', () => {
      const withContext = buildTaskMarkdown({
        id: 'abcd1234',
        title: 'Test task',
        type: 'feature',
        status: 'open',
        createdBy: 'agent-alpha',
        createdAt: '2026-03-15T10:00:00.000Z',
        contextBundle: 'Old context',
      });
      const result = replaceContextBundleInMarkdown(withContext, 'Updated context');
      expect(result).toContain('Updated context');
      expect(result).not.toContain('Old context');
    });
  });
});
