export const A2A_TYPES = [
  'agent_silent',
  // T-012 will add: merge_proposal, split_proposal, dependency_discovery,
  // deadlock_detected, story_archive, file_missing, conflict_flag, rules_change
] as const;

export type A2AType = (typeof A2A_TYPES)[number];

export type A2AStatus = 'open' | 'resolved';
