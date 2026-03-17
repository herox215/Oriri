export const H2A_ACTIONS = ['delete_task'] as const;

export type H2AAction = (typeof H2A_ACTIONS)[number];

export interface H2APayload {
  action: H2AAction;
  targetId: string;
  reason?: string;
}

export function buildH2AContextBundle(payload: H2APayload): string {
  const lines = [
    '### H2A Command',
    '',
    `| Field | Value |`,
    `|-------|-------|`,
    `| action | ${payload.action} |`,
    `| target_id | ${payload.targetId} |`,
  ];

  if (payload.reason) {
    lines.push(`| reason | ${payload.reason} |`);
  }

  return lines.join('\n');
}

export function parseH2AContextBundle(contextBundle: string): H2APayload | null {
  const actionMatch = /\| action \| (.+?) \|/.exec(contextBundle);
  const targetIdMatch = /\| target_id \| (.+?) \|/.exec(contextBundle);

  if (!actionMatch?.[1] || !targetIdMatch?.[1]) {
    return null;
  }

  const action = actionMatch[1];
  if (!H2A_ACTIONS.includes(action as H2AAction)) {
    return null;
  }

  const reasonMatch = /\| reason \| (.+?) \|/.exec(contextBundle);

  return {
    action: action as H2AAction,
    targetId: targetIdMatch[1],
    ...(reasonMatch?.[1] && { reason: reasonMatch[1] }),
  };
}
