import { describe, it, expect } from 'vitest';
import {
  buildA2AMarkdown,
  extractA2AStatusFromMarkdown,
  extractA2ATypeFromMarkdown,
  extractA2ATargetTaskFromMarkdown,
  replaceA2AStatusInMarkdown,
  extractVotersFromMarkdown,
  extractDeadlineFromMarkdown,
  extractVotesFromMarkdown,
  appendVoteToMarkdown,
  replaceVotesSectionInMarkdown,
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

describe('buildA2AMarkdown with voters and deadline', () => {
  it('should include voters and deadline rows when provided', () => {
    const markdown = buildA2AMarkdown({
      id: 'abc12345',
      type: 'rules_change',
      status: 'open',
      createdBy: 'agent-alpha',
      createdAt: '2026-03-16T10:00:00.000Z',
      description: 'Change the voting threshold.',
      voters: [
        { id: 'agent-alpha', model: 'claude-3-5-sonnet' },
        { id: 'agent-human', model: 'human' },
      ],
      deadline: '2026-03-17T10:00:00.000Z',
    });

    expect(markdown).toContain('| voters | agent-alpha:claude-3-5-sonnet,agent-human:human |');
    expect(markdown).toContain('| deadline | 2026-03-17T10:00:00.000Z |');
  });

  it('should omit voters and deadline rows when not provided', () => {
    const markdown = buildA2AMarkdown({
      id: 'abc12345',
      type: 'agent_silent',
      status: 'open',
      createdBy: 'agent-alpha',
      createdAt: '2026-03-16T10:00:00.000Z',
      description: 'Silent.',
    });

    expect(markdown).not.toContain('| voters |');
    expect(markdown).not.toContain('| deadline |');
  });

  it('should always include empty Votes section', () => {
    const markdown = buildA2AMarkdown({
      id: 'abc12345',
      type: 'agent_silent',
      status: 'open',
      createdBy: 'agent-alpha',
      createdAt: '2026-03-16T10:00:00.000Z',
      description: 'Silent.',
    });

    expect(markdown).toContain('## Votes');
    expect(markdown).toContain('| Agent | Vote | Reason | Cast At |');
  });
});

describe('extractVotersFromMarkdown', () => {
  it('should parse voter entries from markdown', () => {
    const md = '| voters | agent-alpha:claude-3-5-sonnet,agent-human:human |';
    const voters = extractVotersFromMarkdown(md);
    expect(voters).toEqual([
      { id: 'agent-alpha', model: 'claude-3-5-sonnet' },
      { id: 'agent-human', model: 'human' },
    ]);
  });

  it('should return empty array when voters row is absent', () => {
    expect(extractVotersFromMarkdown('no voters here')).toEqual([]);
  });
});

describe('extractDeadlineFromMarkdown', () => {
  it('should extract ISO deadline', () => {
    const md = '| deadline | 2026-03-17T10:00:00.000Z |';
    expect(extractDeadlineFromMarkdown(md)).toBe('2026-03-17T10:00:00.000Z');
  });

  it('should return null when deadline row is absent', () => {
    expect(extractDeadlineFromMarkdown('no deadline here')).toBeNull();
  });
});

describe('extractVotesFromMarkdown', () => {
  it('should return empty array when Votes table has no rows', () => {
    const md = buildA2AMarkdown({
      id: 'abc12345',
      type: 'agent_silent',
      status: 'open',
      createdBy: 'agent-alpha',
      createdAt: '2026-03-16T10:00:00.000Z',
      description: 'Silent.',
    });
    expect(extractVotesFromMarkdown(md)).toEqual([]);
  });

  it('should parse vote rows correctly', () => {
    const base = buildA2AMarkdown({
      id: 'abc12345',
      type: 'agent_silent',
      status: 'open',
      createdBy: 'agent-alpha',
      createdAt: '2026-03-16T10:00:00.000Z',
      description: 'Silent.',
    });
    const withVote = appendVoteToMarkdown(base, {
      agentId: 'agent-beta',
      vote: 'YES',
      reason: 'Looks good',
      castAt: '2026-03-16T11:00:00.000Z',
    });
    const votes = extractVotesFromMarkdown(withVote);
    expect(votes).toHaveLength(1);
    expect(votes[0].agentId).toBe('agent-beta');
    expect(votes[0].vote).toBe('YES');
    expect(votes[0].reason).toBe('Looks good');
  });

  it('should handle votes without reason (—)', () => {
    const base = buildA2AMarkdown({
      id: 'abc12345',
      type: 'agent_silent',
      status: 'open',
      createdBy: 'agent-alpha',
      createdAt: '2026-03-16T10:00:00.000Z',
      description: 'Silent.',
    });
    const withVote = appendVoteToMarkdown(base, {
      agentId: 'agent-beta',
      vote: 'NO',
      castAt: '2026-03-16T11:00:00.000Z',
    });
    const votes = extractVotesFromMarkdown(withVote);
    expect(votes[0].reason).toBeUndefined();
  });
});

describe('appendVoteToMarkdown', () => {
  it('should append vote rows and preserve existing ones', () => {
    const base = buildA2AMarkdown({
      id: 'abc12345',
      type: 'agent_silent',
      status: 'open',
      createdBy: 'agent-alpha',
      createdAt: '2026-03-16T10:00:00.000Z',
      description: 'Silent.',
    });
    const after1 = appendVoteToMarkdown(base, {
      agentId: 'agent-alpha',
      vote: 'YES',
      castAt: '2026-03-16T11:00:00.000Z',
    });
    const after2 = appendVoteToMarkdown(after1, {
      agentId: 'agent-beta',
      vote: 'NO',
      castAt: '2026-03-16T12:00:00.000Z',
    });
    const votes = extractVotesFromMarkdown(after2);
    expect(votes).toHaveLength(2);
    expect(votes[0].agentId).toBe('agent-alpha');
    expect(votes[1].agentId).toBe('agent-beta');
  });
});

describe('replaceVotesSectionInMarkdown', () => {
  it('should replace the Votes section entirely', () => {
    const base = buildA2AMarkdown({
      id: 'abc12345',
      type: 'agent_silent',
      status: 'open',
      createdBy: 'agent-alpha',
      createdAt: '2026-03-16T10:00:00.000Z',
      description: 'Silent.',
    });
    const withVotes = appendVoteToMarkdown(base, {
      agentId: 'agent-alpha',
      vote: 'YES',
      castAt: '2026-03-16T11:00:00.000Z',
    });
    const cleared = replaceVotesSectionInMarkdown(withVotes, []);
    expect(extractVotesFromMarkdown(cleared)).toEqual([]);
  });
});
