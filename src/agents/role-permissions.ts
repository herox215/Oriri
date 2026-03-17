import type { AgentRole } from '../config/config-types.js';
import type { TaskType, TaskStatus } from '../tasks/task-types.js';

export type Permission = 'claim' | 'read' | 'none';

export interface RolePermissions {
  tasks: {
    claimableTypes: readonly TaskType[];
    claimableStatuses: readonly TaskStatus[];
    canRead: boolean;
    canCreate: boolean;
  };
  a2a: {
    canCreate: boolean;
    canClaim: boolean;
    canRead: boolean;
  };
  story: {
    canRead: boolean;
    canWrite: boolean;
  };
  canVote: boolean;
}

const ROLE_PERMISSIONS: Record<AgentRole, RolePermissions> = {
  AGENT: {
    tasks: {
      claimableTypes: ['feature', 'bug', 'chore', 'escalation'],
      claimableStatuses: ['open', 'awaiting_review'],
      canRead: true,
      canCreate: true,
    },
    a2a: { canCreate: true, canClaim: true, canRead: true },
    story: { canRead: true, canWrite: true },
    canVote: true,
  },

  MCP_CLIENT: {
    tasks: {
      claimableTypes: ['feature', 'bug', 'chore', 'escalation'],
      claimableStatuses: ['open'],
      canRead: true,
      canCreate: true,
    },
    a2a: { canCreate: false, canClaim: false, canRead: true },
    story: { canRead: true, canWrite: true },
    canVote: false,
  },

  SAGENT: {
    tasks: {
      claimableTypes: [],
      claimableStatuses: [],
      canRead: true,
      canCreate: true,
    },
    a2a: { canCreate: true, canClaim: true, canRead: true },
    story: { canRead: true, canWrite: true },
    canVote: true,
  },
};

export function getPermissionsForRole(role: AgentRole): RolePermissions {
  return ROLE_PERMISSIONS[role];
}
