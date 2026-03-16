import { describe, it, expect } from 'vitest';
import { buildDependencyGraph, findCycles } from './dependency-graph.js';

function makeTask(id: string, deps: string[]): string {
  const depLines = deps.length > 0 ? deps.map((d) => `- ${d}`).join('\n') : 'none';
  return `# Task ${id}\n\n| Field | Value |\n|-------|-------|\n| id | ${id} |\n| status | open |\n\n## Dependencies\n\n${depLines}\n`;
}

describe('buildDependencyGraph()', () => {
  it('returns empty graph for no tasks', () => {
    const graph = buildDependencyGraph(new Map());
    expect(graph.size).toBe(0);
  });

  it('returns empty deps for task with no dependencies', () => {
    const tasks = new Map([['task-a', makeTask('task-a', [])]]);
    const graph = buildDependencyGraph(tasks);
    expect(graph.get('task-a')).toEqual([]);
  });

  it('returns single dep correctly', () => {
    const tasks = new Map([
      ['task-a', makeTask('task-a', ['task-b'])],
      ['task-b', makeTask('task-b', [])],
    ]);
    const graph = buildDependencyGraph(tasks);
    expect(graph.get('task-a')).toEqual(['task-b']);
    expect(graph.get('task-b')).toEqual([]);
  });

  it('returns multiple deps correctly', () => {
    const tasks = new Map([['task-a', makeTask('task-a', ['task-b', 'task-c', 'task-d'])]]);
    const graph = buildDependencyGraph(tasks);
    expect(graph.get('task-a')).toEqual(['task-b', 'task-c', 'task-d']);
  });
});

describe('findCycles()', () => {
  it('returns empty array when no cycles exist', () => {
    const graph = new Map([
      ['a', ['b']],
      ['b', ['c']],
      ['c', []],
    ]);
    expect(findCycles(graph)).toEqual([]);
  });

  it('returns empty array for empty graph', () => {
    expect(findCycles(new Map())).toEqual([]);
  });

  it('detects a direct cycle (A→B→A)', () => {
    const graph = new Map([
      ['a', ['b']],
      ['b', ['a']],
    ]);
    const cycles = findCycles(graph);
    expect(cycles.length).toBeGreaterThan(0);
    const cycle = cycles[0];
    expect(cycle).toContain('a');
    expect(cycle).toContain('b');
  });

  it('detects a transitive cycle (A→B→C→A)', () => {
    const graph = new Map([
      ['a', ['b']],
      ['b', ['c']],
      ['c', ['a']],
    ]);
    const cycles = findCycles(graph);
    expect(cycles.length).toBeGreaterThan(0);
    const cycle = cycles[0];
    expect(cycle).toContain('a');
    expect(cycle).toContain('b');
    expect(cycle).toContain('c');
  });

  it('detects a self-dependency (A→A)', () => {
    const graph = new Map([['a', ['a']]]);
    const cycles = findCycles(graph);
    expect(cycles.length).toBeGreaterThan(0);
    expect(cycles[0]).toContain('a');
  });

  it('does not flag a linear chain as a cycle', () => {
    const graph = new Map([
      ['a', ['b']],
      ['b', ['c']],
      ['c', ['d']],
      ['d', []],
    ]);
    expect(findCycles(graph)).toEqual([]);
  });
});
