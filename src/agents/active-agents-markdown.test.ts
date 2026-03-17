import { describe, it, expect } from 'vitest';
import { ACTIVE_AGENTS_MD } from '../shared/default-content.js';
import type { ActiveAgent } from './agent-types.js';
import {
  parseActiveAgentsMarkdown,
  buildActiveAgentsMarkdown,
  addAgentRow,
  removeAgentRow,
} from './active-agents-markdown.js';

const sampleAgent: ActiveAgent = {
  id: 'agent-alpha',
  role: 'AGENT',
  model: 'claude-sonnet-4-6',
  pid: 48291,
  since: '2026-03-15',
};

const secondAgent: ActiveAgent = {
  id: 'agent-reviewer',
  role: 'AGENT',
  model: 'claude-haiku-4-5',
  pid: 48305,
  since: '2026-03-15',
};

describe('parseActiveAgentsMarkdown', () => {
  it('should return empty array for empty table', () => {
    expect(parseActiveAgentsMarkdown(ACTIVE_AGENTS_MD)).toEqual([]);
  });

  it('should parse a single agent row', () => {
    const content =
      ACTIVE_AGENTS_MD + '| agent-alpha | AGENT | claude-sonnet-4-6 | 48291 | 2026-03-15 |\n';
    const result = parseActiveAgentsMarkdown(content);
    expect(result).toEqual([sampleAgent]);
  });

  it('should parse multiple agent rows', () => {
    const content =
      ACTIVE_AGENTS_MD +
      '| agent-alpha | AGENT | claude-sonnet-4-6 | 48291 | 2026-03-15 |\n' +
      '| agent-reviewer | AGENT | claude-haiku-4-5 | 48305 | 2026-03-15 |\n';
    const result = parseActiveAgentsMarkdown(content);
    expect(result).toEqual([sampleAgent, secondAgent]);
  });

  it('should handle extra whitespace in cells', () => {
    const content =
      ACTIVE_AGENTS_MD +
      '|  agent-alpha  |  AGENT  |  claude-sonnet-4-6  |  48291  |  2026-03-15  |\n';
    const result = parseActiveAgentsMarkdown(content);
    expect(result).toEqual([sampleAgent]);
  });
});

describe('buildActiveAgentsMarkdown', () => {
  it('should produce header-only for empty array', () => {
    expect(buildActiveAgentsMarkdown([])).toBe(ACTIVE_AGENTS_MD);
  });

  it('should produce valid table with agents', () => {
    const result = buildActiveAgentsMarkdown([sampleAgent]);
    expect(result).toContain('| agent-alpha | AGENT | claude-sonnet-4-6 | 48291 | 2026-03-15 |');
  });

  it('should roundtrip parse/build', () => {
    const agents = [sampleAgent, secondAgent];
    const markdown = buildActiveAgentsMarkdown(agents);
    const parsed = parseActiveAgentsMarkdown(markdown);
    expect(parsed).toEqual(agents);
  });
});

describe('addAgentRow', () => {
  it('should add an agent to an empty table', () => {
    const result = addAgentRow(ACTIVE_AGENTS_MD, sampleAgent);
    const parsed = parseActiveAgentsMarkdown(result);
    expect(parsed).toEqual([sampleAgent]);
  });

  it('should add an agent to an existing table', () => {
    const withOne = addAgentRow(ACTIVE_AGENTS_MD, sampleAgent);
    const withTwo = addAgentRow(withOne, secondAgent);
    const parsed = parseActiveAgentsMarkdown(withTwo);
    expect(parsed).toEqual([sampleAgent, secondAgent]);
  });
});

describe('removeAgentRow', () => {
  it('should remove an agent from the table', () => {
    const content = buildActiveAgentsMarkdown([sampleAgent, secondAgent]);
    const result = removeAgentRow(content, 'agent-alpha');
    const parsed = parseActiveAgentsMarkdown(result);
    expect(parsed).toEqual([secondAgent]);
  });

  it('should return unchanged content for non-existent agent', () => {
    const content = buildActiveAgentsMarkdown([sampleAgent]);
    const result = removeAgentRow(content, 'agent-ghost');
    const parsed = parseActiveAgentsMarkdown(result);
    expect(parsed).toEqual([sampleAgent]);
  });

  it('should produce empty table when removing last agent', () => {
    const content = buildActiveAgentsMarkdown([sampleAgent]);
    const result = removeAgentRow(content, 'agent-alpha');
    expect(result).toBe(ACTIVE_AGENTS_MD);
  });
});
