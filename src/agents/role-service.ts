import type { AgentRole } from '../config/config-types.js';
import type { TaskType, TaskStatus } from '../tasks/task-types.js';
import { PermissionDeniedError } from '../shared/errors.js';
import { getPermissionsForRole } from './role-permissions.js';

export class RoleService {
  checkCanClaimTask(role: AgentRole, taskType: TaskType, taskStatus: TaskStatus): void {
    const permissions = getPermissionsForRole(role);

    if (permissions.tasks.claimableTypes.length === 0) {
      throw new PermissionDeniedError('claim task', role, 'role cannot claim tasks');
    }

    if (!permissions.tasks.claimableStatuses.includes(taskStatus)) {
      throw new PermissionDeniedError(
        'claim task',
        role,
        `can only claim tasks with status: ${permissions.tasks.claimableStatuses.join(', ')}`,
      );
    }

    if (!permissions.tasks.claimableTypes.includes(taskType)) {
      throw new PermissionDeniedError(
        'claim task',
        role,
        `can only claim task types: ${permissions.tasks.claimableTypes.join(', ')}`,
      );
    }
  }

  checkCanCreateA2A(role: AgentRole): void {
    const permissions = getPermissionsForRole(role);

    if (!permissions.a2a.canCreate) {
      throw new PermissionDeniedError('create A2A task', role);
    }
  }

  checkCanClaimA2A(role: AgentRole): void {
    const permissions = getPermissionsForRole(role);

    if (!permissions.a2a.canClaim) {
      throw new PermissionDeniedError(
        'claim A2A task',
        role,
        'only COORDINATOR can claim A2A tasks',
      );
    }
  }

  checkCanVote(role: AgentRole): void {
    const permissions = getPermissionsForRole(role);

    if (!permissions.canVote) {
      throw new PermissionDeniedError('vote', role);
    }
  }

  checkCanWriteStory(role: AgentRole): void {
    const permissions = getPermissionsForRole(role);

    if (!permissions.story.canWrite) {
      throw new PermissionDeniedError('write to story.md', role);
    }
  }

  checkCanCreateTask(role: AgentRole): void {
    const permissions = getPermissionsForRole(role);

    if (!permissions.tasks.canCreate) {
      throw new PermissionDeniedError('create task', role);
    }
  }
}
