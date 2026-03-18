import { describe, it, expect } from 'vitest';
import { RoleService } from './role-service.js';
import { getPermissionsForRole } from './role-permissions.js';
import { PermissionDeniedError } from '../shared/errors.js';
import { AGENT_ROLES } from '../config/config-types.js';

describe('RoleService', () => {
  const service = new RoleService();

  describe('checkCanClaimTask', () => {
    it('should allow AGENT to claim all task types with status open', () => {
      expect(() => {
        service.checkCanClaimTask('AGENT', 'feature', 'open');
      }).not.toThrow();
      expect(() => {
        service.checkCanClaimTask('AGENT', 'bug', 'open');
      }).not.toThrow();
      expect(() => {
        service.checkCanClaimTask('AGENT', 'chore', 'open');
      }).not.toThrow();
      expect(() => {
        service.checkCanClaimTask('AGENT', 'escalation', 'open');
      }).not.toThrow();
    });

    it('should allow AGENT to claim awaiting_review tasks', () => {
      expect(() => {
        service.checkCanClaimTask('AGENT', 'feature', 'awaiting_review');
      }).not.toThrow();
      expect(() => {
        service.checkCanClaimTask('AGENT', 'bug', 'awaiting_review');
      }).not.toThrow();
    });

    it('should allow MCP_CLIENT to claim all task types with status open', () => {
      expect(() => {
        service.checkCanClaimTask('MCP_CLIENT', 'feature', 'open');
      }).not.toThrow();
      expect(() => {
        service.checkCanClaimTask('MCP_CLIENT', 'bug', 'open');
      }).not.toThrow();
      expect(() => {
        service.checkCanClaimTask('MCP_CLIENT', 'chore', 'open');
      }).not.toThrow();
      expect(() => {
        service.checkCanClaimTask('MCP_CLIENT', 'escalation', 'open');
      }).not.toThrow();
    });

    it('should deny MCP_CLIENT from claiming awaiting_review tasks', () => {
      expect(() => {
        service.checkCanClaimTask('MCP_CLIENT', 'feature', 'awaiting_review');
      }).toThrow(PermissionDeniedError);
    });

    it('should include error code PERMISSION_DENIED', () => {
      try {
        service.checkCanClaimTask('MCP_CLIENT', 'feature', 'awaiting_review');
      } catch (error) {
        expect(error).toBeInstanceOf(PermissionDeniedError);
        expect((error as PermissionDeniedError).code).toBe('PERMISSION_DENIED');
      }
    });
  });

  describe('checkCanCreateA2A', () => {
    it('should allow AGENT to create A2A tasks', () => {
      expect(() => {
        service.checkCanCreateA2A('AGENT');
      }).not.toThrow();
    });

    it('should deny MCP_CLIENT from creating A2A tasks', () => {
      expect(() => {
        service.checkCanCreateA2A('MCP_CLIENT');
      }).toThrow(PermissionDeniedError);
    });
  });

  describe('checkCanClaimA2A', () => {
    it('should allow AGENT to claim A2A tasks', () => {
      expect(() => {
        service.checkCanClaimA2A('AGENT');
      }).not.toThrow();
    });

    it('should deny MCP_CLIENT from claiming A2A tasks', () => {
      expect(() => {
        service.checkCanClaimA2A('MCP_CLIENT');
      }).toThrow(PermissionDeniedError);
    });

    it('should deny SAGENT from claiming A2A tasks', () => {
      expect(() => {
        service.checkCanClaimA2A('SAGENT');
      }).toThrow(PermissionDeniedError);
    });
  });

  describe('SAGENT A2A permissions', () => {
    it('should allow SAGENT to create A2A tasks', () => {
      expect(() => {
        service.checkCanCreateA2A('SAGENT');
      }).not.toThrow();
    });

    it('should allow SAGENT to vote', () => {
      expect(() => {
        service.checkCanVote('SAGENT');
      }).not.toThrow();
    });
  });

  describe('checkCanVote', () => {
    it('should allow AGENT to vote', () => {
      expect(() => {
        service.checkCanVote('AGENT');
      }).not.toThrow();
    });

    it('should deny MCP_CLIENT from voting', () => {
      expect(() => {
        service.checkCanVote('MCP_CLIENT');
      }).toThrow(PermissionDeniedError);
    });
  });

  describe('checkCanWriteStory', () => {
    it('should allow both AGENT and MCP_CLIENT to write story', () => {
      expect(() => {
        service.checkCanWriteStory('AGENT');
      }).not.toThrow();
      expect(() => {
        service.checkCanWriteStory('MCP_CLIENT');
      }).not.toThrow();
    });
  });

  describe('checkCanCreateTask', () => {
    it('should allow both AGENT and MCP_CLIENT to create tasks', () => {
      expect(() => {
        service.checkCanCreateTask('AGENT');
      }).not.toThrow();
      expect(() => {
        service.checkCanCreateTask('MCP_CLIENT');
      }).not.toThrow();
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
