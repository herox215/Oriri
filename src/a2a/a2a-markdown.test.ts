import { describe, it, expect } from 'vitest';
import {
  buildA2AMarkdown,
  extractA2AStatusFromMarkdown,
  extractA2ATypeFromMarkdown,
  extractA2ATargetTaskFromMarkdown,
  replaceA2AStatusInMarkdown,
} from './a2a-markdown.js';

describe('buildA2AMarkdown', () => {
  it('should build valid A2A markdown with all fields', () => {
    const markdown = buildA2AMarkdown({
      id: 'abc12345',
      type: 'agent_silent',
      status: 'open',
      createdBy: 'agent-beta',
      createdAt: '2026-03-15T14:30:00.000Z',
      targetTaskId: 'task-001',
      targetAgentId: 'agent-alpha',
      description: 'Agent agent-alpha has not updated task task-001 for over 60 minutes.',
    });

    expect(markdown).toContain('# A2A: agent_silent');
    expect(markdown).toContain('| id | abc12345 |');
    expect(markdown).toContain('| type | agent_silent |');
    expect(markdown).toContain('| status | open |');
    expect(markdown).toContain('| created_by | agent-beta |');
    expect(markdown).toContain('| target_task | task-001 |');
    expect(markdown).toContain('| target_agent | agent-alpha |');
    expect(markdown).toContain('Agent agent-alpha has not updated task task-001');
  });

  it('should use — for missing optional fields', () => {
    const markdown = buildA2AMarkdown({
      id: 'abc12345',
      type: 'agent_silent',
      status: 'open',
      createdBy: 'agent-beta',
      createdAt: '2026-03-15T14:30:00.000Z',
      description: 'Some issue detected.',
    });

    expect(markdown).toContain('| target_task | — |');
    expect(markdown).toContain('| target_agent | — |');
  });
});

describe('extractA2AStatusFromMarkdown', () => {
  it('should extract open status', () => {
    const md = '| status | open |';
    expect(extractA2AStatusFromMarkdown(md)).toBe('open');
  });

  it('should extract resolved status', () => {
    const md = '| status | resolved |';
    expect(extractA2AStatusFromMarkdown(md)).toBe('resolved');
  });

  it('should return null for invalid status', () => {
    const md = '| status | unknown |';
    expect(extractA2AStatusFromMarkdown(md)).toBeNull();
  });

  it('should return null for missing status', () => {
    expect(extractA2AStatusFromMarkdown('no status here')).toBeNull();
  });
});

describe('extractA2ATypeFromMarkdown', () => {
  it('should extract type', () => {
    const md = '| type | agent_silent |';
    expect(extractA2ATypeFromMarkdown(md)).toBe('agent_silent');
  });

  it('should return null for missing type', () => {
    expect(extractA2ATypeFromMarkdown('no type here')).toBeNull();
  });
});

describe('extractA2ATargetTaskFromMarkdown', () => {
  it('should extract target task ID', () => {
    const md = '| target_task | task-001 |';
    expect(extractA2ATargetTaskFromMarkdown(md)).toBe('task-001');
  });

  it('should return null when target_task is —', () => {
    const md = '| target_task | — |';
    expect(extractA2ATargetTaskFromMarkdown(md)).toBeNull();
  });
});

describe('replaceA2AStatusInMarkdown', () => {
  it('should replace status from open to resolved', () => {
    const md = '| status | open |';
    const result = replaceA2AStatusInMarkdown(md, 'resolved');
    expect(result).toContain('| status | resolved');
  });
});
