import { describe, it, expect } from 'vitest';
import { RoleService } from './role-service.js';
import { getPermissionsForRole } from './role-permissions.js';
import { PermissionDeniedError } from '../shared/errors.js';
import type { AgentRole } from '../config/config-types.js';
import { AGENT_ROLES } from '../config/config-types.js';

describe('RoleService', () => {
  const service = new RoleService();

  describe('checkCanClaimTask', () => {
    it('should allow CODER to claim feature/bug/chore with status open', () => {
      expect(() => {
        service.checkCanClaimTask('CODER', 'feature', 'open');
      }).not.toThrow();
      expect(() => {
        service.checkCanClaimTask('CODER', 'bug', 'open');
      }).not.toThrow();
      expect(() => {
        service.checkCanClaimTask('CODER', 'chore', 'open');
      }).not.toThrow();
    });

    it('should deny CODER from claiming escalation', () => {
      expect(() => {
        service.checkCanClaimTask('CODER', 'escalation', 'open');
      }).toThrow(PermissionDeniedError);
    });

    it('should deny CODER from claiming awaiting_review tasks', () => {
      expect(() => {
        service.checkCanClaimTask('CODER', 'feature', 'awaiting_review');
      }).toThrow(PermissionDeniedError);
    });

    it('should allow REVIEWER to claim only awaiting_review tasks', () => {
      expect(() => {
        service.checkCanClaimTask('REVIEWER', 'feature', 'awaiting_review');
      }).not.toThrow();
      expect(() => {
        service.checkCanClaimTask('REVIEWER', 'bug', 'awaiting_review');
      }).not.toThrow();
    });

    it('should deny REVIEWER from claiming open tasks', () => {
      expect(() => {
        service.checkCanClaimTask('REVIEWER', 'feature', 'open');
      }).toThrow(PermissionDeniedError);
    });

    it('should deny COORDINATOR from claiming any task', () => {
      expect(() => {
        service.checkCanClaimTask('COORDINATOR', 'feature', 'open');
      }).toThrow(PermissionDeniedError);
      expect(() => {
        service.checkCanClaimTask('COORDINATOR', 'bug', 'awaiting_review');
      }).toThrow(PermissionDeniedError);
    });

    it('should deny OBSERVER from claiming any task', () => {
      expect(() => {
        service.checkCanClaimTask('OBSERVER', 'feature', 'open');
      }).toThrow(PermissionDeniedError);
    });

    it('should allow GENERALIST to claim all task types', () => {
      expect(() => {
        service.checkCanClaimTask('GENERALIST', 'feature', 'open');
      }).not.toThrow();
      expect(() => {
        service.checkCanClaimTask('GENERALIST', 'bug', 'open');
      }).not.toThrow();
      expect(() => {
        service.checkCanClaimTask('GENERALIST', 'chore', 'open');
      }).not.toThrow();
      expect(() => {
        service.checkCanClaimTask('GENERALIST', 'escalation', 'open');
      }).not.toThrow();
    });

    it('should allow ARCHITECT to claim all task types', () => {
      expect(() => {
        service.checkCanClaimTask('ARCHITECT', 'feature', 'open');
      }).not.toThrow();
      expect(() => {
        service.checkCanClaimTask('ARCHITECT', 'escalation', 'open');
      }).not.toThrow();
    });

    it('should include error code PERMISSION_DENIED', () => {
      try {
        service.checkCanClaimTask('OBSERVER', 'feature', 'open');
      } catch (error) {
        expect(error).toBeInstanceOf(PermissionDeniedError);
        expect((error as PermissionDeniedError).code).toBe('PERMISSION_DENIED');
      }
    });
  });

  describe('checkCanCreateA2A', () => {
    it('should allow all roles except OBSERVER to create A2A tasks', () => {
      const rolesWithAccess: AgentRole[] = [
        'GENERALIST',
        'CODER',
        'REVIEWER',
        'COORDINATOR',
        'ARCHITECT',
      ];
      for (const role of rolesWithAccess) {
        expect(() => {
          service.checkCanCreateA2A(role);
        }).not.toThrow();
      }
    });

    it('should deny OBSERVER from creating A2A tasks', () => {
      expect(() => {
        service.checkCanCreateA2A('OBSERVER');
      }).toThrow(PermissionDeniedError);
    });
  });

  describe('checkCanClaimA2A', () => {
    it('should allow only COORDINATOR to claim A2A tasks', () => {
      expect(() => {
        service.checkCanClaimA2A('COORDINATOR');
      }).not.toThrow();
    });

    it('should deny non-COORDINATOR roles from claiming A2A tasks', () => {
      const otherRoles: AgentRole[] = ['GENERALIST', 'CODER', 'REVIEWER', 'ARCHITECT', 'OBSERVER'];
      for (const role of otherRoles) {
        expect(() => {
          service.checkCanClaimA2A(role);
        }).toThrow(PermissionDeniedError);
      }
    });
  });

  describe('checkCanVote', () => {
    it('should allow all roles except OBSERVER to vote', () => {
      const votingRoles: AgentRole[] = [
        'GENERALIST',
        'CODER',
        'REVIEWER',
        'COORDINATOR',
        'ARCHITECT',
      ];
      for (const role of votingRoles) {
        expect(() => {
          service.checkCanVote(role);
        }).not.toThrow();
      }
    });

    it('should deny OBSERVER from voting', () => {
      expect(() => {
        service.checkCanVote('OBSERVER');
      }).toThrow(PermissionDeniedError);
    });
  });

  describe('checkCanWriteStory', () => {
    it('should allow all roles except OBSERVER to write story', () => {
      const writingRoles: AgentRole[] = [
        'GENERALIST',
        'CODER',
        'REVIEWER',
        'COORDINATOR',
        'ARCHITECT',
      ];
      for (const role of writingRoles) {
        expect(() => {
          service.checkCanWriteStory(role);
        }).not.toThrow();
      }
    });

    it('should deny OBSERVER from writing story', () => {
      expect(() => {
        service.checkCanWriteStory('OBSERVER');
      }).toThrow(PermissionDeniedError);
    });
  });

  describe('checkCanCreateTask', () => {
    it('should allow all roles except OBSERVER to create tasks', () => {
      const creatingRoles: AgentRole[] = [
        'GENERALIST',
        'CODER',
        'REVIEWER',
        'COORDINATOR',
        'ARCHITECT',
      ];
      for (const role of creatingRoles) {
        expect(() => {
          service.checkCanCreateTask(role);
        }).not.toThrow();
      }
    });

    it('should deny OBSERVER from creating tasks', () => {
      expect(() => {
        service.checkCanCreateTask('OBSERVER');
      }).toThrow(PermissionDeniedError);
    });
  });
});

describe('getPermissionsForRole', () => {
  it('should return permissions for every defined role', () => {
    for (const role of AGENT_ROLES) {
      const perms = getPermissionsForRole(role);
      expect(perms).toBeDefined();
      expect(perms.tasks).toBeDefined();
      expect(perms.a2a).toBeDefined();
      expect(perms.story).toBeDefined();
      expect(typeof perms.canVote).toBe('boolean');
    }
  });

  it('should give all roles read access to tasks', () => {
    for (const role of AGENT_ROLES) {
      expect(getPermissionsForRole(role).tasks.canRead).toBe(true);
    }
  });

  it('should give all roles read access to story', () => {
    for (const role of AGENT_ROLES) {
      expect(getPermissionsForRole(role).story.canRead).toBe(true);
    }
  });

  it('should give all roles read access to A2A', () => {
    for (const role of AGENT_ROLES) {
      expect(getPermissionsForRole(role).a2a.canRead).toBe(true);
    }
  });
});
