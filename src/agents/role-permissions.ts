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
  GENERALIST: {
    tasks: {
      claimableTypes: ['feature', 'bug', 'chore', 'escalation'],
      claimableStatuses: ['open'],
      canRead: true,
      canCreate: true,
    },
    a2a: { canCreate: true, canClaim: false, canRead: true },
    story: { canRead: true, canWrite: true },
    canVote: true,
  },

  CODER: {
    tasks: {
      claimableTypes: ['feature', 'bug', 'chore'],
      claimableStatuses: ['open'],
      canRead: true,
      canCreate: true,
    },
    a2a: { canCreate: true, canClaim: false, canRead: true },
    story: { canRead: true, canWrite: true },
    canVote: true,
  },

  REVIEWER: {
    tasks: {
      claimableTypes: ['feature', 'bug', 'chore', 'escalation'],
      claimableStatuses: ['awaiting_review'],
      canRead: true,
      canCreate: true,
    },
    a2a: { canCreate: true, canClaim: false, canRead: true },
    story: { canRead: true, canWrite: true },
    canVote: true,
  },

  COORDINATOR: {
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

  ARCHITECT: {
    tasks: {
      claimableTypes: ['feature', 'bug', 'chore', 'escalation'],
      claimableStatuses: ['open'],
      canRead: true,
      canCreate: true,
    },
    a2a: { canCreate: true, canClaim: false, canRead: true },
    story: { canRead: true, canWrite: true },
    canVote: true,
  },

  OBSERVER: {
    tasks: {
      claimableTypes: [],
      claimableStatuses: [],
      canRead: true,
      canCreate: false,
    },
    a2a: { canCreate: false, canClaim: false, canRead: true },
    story: { canRead: true, canWrite: false },
    canVote: false,
  },

  MCP_CLIENT: {
    tasks: {
      claimableTypes: ['feature', 'bug', 'chore', 'escalation'],
      claimableStatuses: ['open'],
      canRead: true,
      canCreate: true,
    },
    a2a: { canCreate: false, canClaim: false, canRead: true },
    story: { canRead: true, canWrite: false },
    canVote: false,
  },
};

export function getPermissionsForRole(role: AgentRole): RolePermissions {
  return ROLE_PERMISSIONS[role];
}
