import { describe, it, expect } from 'vitest';
import {
  buildTaskMarkdown,
  extractTitleFromMarkdown,
  extractStatusFromMarkdown,
  extractDescriptionFromMarkdown,
  replaceStatusInMarkdown,
} from './task-markdown.js';

describe('task-markdown helpers', () => {
  const sampleMarkdown = buildTaskMarkdown({
    id: 'abcd1234',
    title: 'Test task',
    status: 'open',
    createdAt: '2026-03-15T10:00:00.000Z',
  });

  describe('buildTaskMarkdown', () => {
    it('should build markdown with title and metadata', () => {
      expect(sampleMarkdown).toContain('# Test task');
      expect(sampleMarkdown).toContain('| id | abcd1234 |');
      expect(sampleMarkdown).toContain('| status | open |');
      expect(sampleMarkdown).toContain('| created_at | 2026-03-15T10:00:00.000Z |');
    });

    it('should include description when provided', () => {
      const md = buildTaskMarkdown({
        id: 'abcd1234',
        title: 'Test task',
        status: 'open',
        createdAt: '2026-03-15T10:00:00.000Z',
        description: 'A detailed description',
      });
      expect(md).toContain('## Description');
      expect(md).toContain('A detailed description');
    });
  });

  describe('extractTitleFromMarkdown', () => {
    it('should extract the title', () => {
      expect(extractTitleFromMarkdown(sampleMarkdown)).toBe('Test task');
    });

    it('should return null for malformed markdown', () => {
      expect(extractTitleFromMarkdown('no heading here')).toBeNull();
    });
  });

  describe('extractStatusFromMarkdown', () => {
    it('should extract the status', () => {
      expect(extractStatusFromMarkdown(sampleMarkdown)).toBe('open');
    });

    it('should return null for malformed markdown', () => {
      expect(extractStatusFromMarkdown('no table here')).toBeNull();
    });
  });

  describe('replaceStatusInMarkdown', () => {
    it('should replace the status', () => {
      const result = replaceStatusInMarkdown(sampleMarkdown, 'done');
      expect(result).toContain('| status | done |');
      expect(result).not.toContain('| status | open |');
    });
  });

  describe('extractDescriptionFromMarkdown', () => {
    it('should return empty string when no description', () => {
      expect(extractDescriptionFromMarkdown(sampleMarkdown)).toBe('');
    });

    it('should extract description content', () => {
      const md = buildTaskMarkdown({
        id: 'abcd1234',
        title: 'Test',
        status: 'open',
        createdAt: '2026-03-15T10:00:00.000Z',
        description: 'My description',
      });
      expect(extractDescriptionFromMarkdown(md)).toBe('My description');
    });
  });
});
