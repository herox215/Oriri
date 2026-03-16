import { describe, it, expect } from 'vitest';
import { buildTaskMarkdown } from '../tasks/task-markdown.js';
import { buildA2AMarkdown } from '../a2a/a2a-markdown.js';
import {
  shouldNotifyTaskChange,
  shouldNotifyA2AChange,
} from './notification-watcher.js';
import { DEFAULT_NOTIFICATION_CONFIG, type NotificationConfig } from './notification-types.js';

function taskMarkdown(status: string): string {
  return buildTaskMarkdown({
    id: 'abc123',
    title: 'Test task',
    type: 'feature',
    status: status as never,
    createdBy: 'agent-alpha',
    createdAt: '2026-03-16T10:00:00Z',
  });
}

function a2aMarkdown(type: string, status: 'open' | 'resolved'): string {
  const base = buildA2AMarkdown({
    id: 'a2a-xyz',
    type: type as never,
    status,
    createdBy: 'agent-alpha',
    createdAt: '2026-03-16T10:00:00Z',
    description: 'Test description',
  });
  // buildA2AMarkdown always sets status from the fields
  return base;
}

describe('shouldNotifyTaskChange', () => {
  it('returns notification for needs_human status', () => {
    const result = shouldNotifyTaskChange(taskMarkdown('needs_human'), DEFAULT_NOTIFICATION_CONFIG);
    expect(result).not.toBeNull();
    expect(result?.title).toBe('Oriri — Human Gate');
    expect(result?.message).toContain('abc123');
  });

  it('returns null for other statuses', () => {
    for (const status of ['open', 'planning', 'executing', 'waiting_for_agent', 'awaiting_review']) {
      const result = shouldNotifyTaskChange(taskMarkdown(status), DEFAULT_NOTIFICATION_CONFIG);
      expect(result).toBeNull();
    }
  });

  it('returns null for done when taskDone=false (default)', () => {
    const result = shouldNotifyTaskChange(taskMarkdown('done'), DEFAULT_NOTIFICATION_CONFIG);
    expect(result).toBeNull();
  });

  it('returns notification for done when taskDone=true', () => {
    const config: NotificationConfig = {
      events: { ...DEFAULT_NOTIFICATION_CONFIG.events, taskDone: true },
    };
    const result = shouldNotifyTaskChange(taskMarkdown('done'), config);
    expect(result).not.toBeNull();
    expect(result?.title).toBe('Oriri — Task Done');
    expect(result?.message).toContain('abc123');
  });

  it('returns null when needsHuman=false', () => {
    const config: NotificationConfig = {
      events: { ...DEFAULT_NOTIFICATION_CONFIG.events, needsHuman: false },
    };
    const result = shouldNotifyTaskChange(taskMarkdown('needs_human'), config);
    expect(result).toBeNull();
  });
});

describe('shouldNotifyA2AChange', () => {
  it('returns notification for agent_silent + open', () => {
    const result = shouldNotifyA2AChange(
      a2aMarkdown('agent_silent', 'open'),
      DEFAULT_NOTIFICATION_CONFIG,
    );
    expect(result).not.toBeNull();
    expect(result?.title).toBe('Oriri — Agent Stale');
    expect(result?.message).toContain('a2a-xyz');
  });

  it('returns null for agent_silent when agentSilent=false', () => {
    const config: NotificationConfig = {
      events: { ...DEFAULT_NOTIFICATION_CONFIG.events, agentSilent: false },
    };
    const result = shouldNotifyA2AChange(a2aMarkdown('agent_silent', 'open'), config);
    expect(result).toBeNull();
  });

  it('returns consent notification for open A2A of other types', () => {
    const result = shouldNotifyA2AChange(
      a2aMarkdown('merge_proposal', 'open'),
      DEFAULT_NOTIFICATION_CONFIG,
    );
    expect(result).not.toBeNull();
    expect(result?.title).toBe('Oriri — Consent Needed');
    expect(result?.message).toContain('merge_proposal');
    expect(result?.message).toContain('a2a-xyz');
  });

  it('returns null for resolved A2A', () => {
    const result = shouldNotifyA2AChange(
      a2aMarkdown('merge_proposal', 'resolved'),
      DEFAULT_NOTIFICATION_CONFIG,
    );
    expect(result).toBeNull();
  });

  it('returns null for open consent when openConsent=false', () => {
    const config: NotificationConfig = {
      events: { ...DEFAULT_NOTIFICATION_CONFIG.events, openConsent: false },
    };
    const result = shouldNotifyA2AChange(a2aMarkdown('merge_proposal', 'open'), config);
    expect(result).toBeNull();
  });
});
