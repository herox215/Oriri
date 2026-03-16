import { extractDependenciesFromMarkdown } from './task-markdown.js';

export function buildDependencyGraph(tasks: Map<string, string>): Map<string, string[]> {
  const graph = new Map<string, string[]>();

  for (const [id, markdown] of tasks) {
    graph.set(id, extractDependenciesFromMarkdown(markdown));
  }

  return graph;
}

export function findCycles(graph: Map<string, string[]>): string[][] {
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const cycles: string[][] = [];

  function dfs(nodeId: string, path: string[]): void {
    if (visiting.has(nodeId)) {
      const cycleStart = path.indexOf(nodeId);
      cycles.push(path.slice(cycleStart));
      return;
    }
    if (visited.has(nodeId)) return;

    visiting.add(nodeId);
    path.push(nodeId);

    const deps = graph.get(nodeId) ?? [];
    for (const dep of deps) {
      dfs(dep, path);
    }

    path.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
  }

  for (const nodeId of graph.keys()) {
    dfs(nodeId, []);
  }

  return cycles;
}
