import type { AgentRole } from '../config/config-types.js';
import type { StorageInterface } from '../storage/storage-interface.js';
import { A2ANotFoundError, VoteAlreadyCastError, VoteNotAllowedError } from '../shared/errors.js';
import { StorageReadError } from '../shared/errors.js';
import type { RoleService } from '../agents/role-service.js';
import {
  extractA2AStatusFromMarkdown,
  extractA2ATypeFromMarkdown,
  extractVotersFromMarkdown,
  extractDeadlineFromMarkdown,
  extractVotesFromMarkdown,
  appendVoteToMarkdown,
  type VoteValue,
} from './a2a-markdown.js';

export type { VoteValue };

export interface ConsentResult {
  outcome: 'accepted' | 'rejected' | 'pending';
  yesCount: number;
  noCount: number;
  totalEligible: number;
  detail: string;
}

function formatLogLine(agentId: string, message: string): string {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  return `[${timestamp}] ${agentId} | ${message}`;
}

export class ConsentService {
  constructor(
    private readonly storage: StorageInterface,
    private readonly roleService: RoleService,
  ) {}

  async vote(
    a2aId: string,
    agentId: string,
    agentRole: AgentRole,
    vote: VoteValue,
    reason?: string,
  ): Promise<void> {
    let markdown: string;
    try {
      markdown = await this.storage.readA2A(a2aId);
    } catch (error: unknown) {
      if (error instanceof StorageReadError) throw new A2ANotFoundError(a2aId);
      throw error;
    }

    const status = extractA2AStatusFromMarkdown(markdown);
    if (status === 'resolved') {
      throw new VoteNotAllowedError('A2A task is already resolved');
    }

    this.roleService.checkCanVote(agentRole);

    const existing = extractVotesFromMarkdown(markdown);
    if (existing.some((v) => v.agentId === agentId)) {
      throw new VoteAlreadyCastError(agentId, a2aId);
    }

    const updated = appendVoteToMarkdown(markdown, {
      agentId,
      vote,
      reason,
      castAt: new Date().toISOString(),
    });

    await this.storage.writeA2A(a2aId, updated);
    await this.storage.appendA2ALog(a2aId, formatLogLine(agentId, `voted ${vote}`));
  }

  async checkConsent(a2aId: string): Promise<ConsentResult> {
    let markdown: string;
    try {
      markdown = await this.storage.readA2A(a2aId);
    } catch (error: unknown) {
      if (error instanceof StorageReadError) throw new A2ANotFoundError(a2aId);
      throw error;
    }

    const voters = extractVotersFromMarkdown(markdown);
    if (voters.length === 0) {
      return {
        outcome: 'pending',
        yesCount: 0,
        noCount: 0,
        totalEligible: 0,
        detail: 'No voters configured',
      };
    }

    const deadline = extractDeadlineFromMarkdown(markdown);
    const isDeadlinePassed = deadline !== null && new Date() > new Date(deadline);
    const votes = extractVotesFromMarkdown(markdown);
    const type = extractA2ATypeFromMarkdown(markdown);

    if (type === 'rules_change') {
      return this.checkMetaRule(voters, votes, isDeadlinePassed);
    }

    return this.checkMajority(voters, votes, isDeadlinePassed);
  }

  private checkMajority(
    voters: ReturnType<typeof extractVotersFromMarkdown>,
    votes: ReturnType<typeof extractVotesFromMarkdown>,
    isDeadlinePassed: boolean,
  ): ConsentResult {
    const totalEligible = voters.length;
    const voteMap = new Map(votes.map((v) => [v.agentId, v.vote]));

    let yesCount = 0;
    let noCount = 0;
    let abstainCount = 0;
    let pendingCount = 0;

    for (const voter of voters) {
      const cast = voteMap.get(voter.id);
      if (cast === 'YES') {
        yesCount++;
      } else if (cast === 'NO') {
        noCount++;
      } else if (cast === 'ABSTAIN') {
        abstainCount++;
      } else if (isDeadlinePassed) {
        // silence after deadline = YES
        yesCount++;
      } else {
        pendingCount++;
      }
    }

    if (pendingCount > 0) {
      return {
        outcome: 'pending',
        yesCount,
        noCount,
        totalEligible,
        detail: `${String(pendingCount)} voter(s) have not yet voted`,
      };
    }

    const base = totalEligible - abstainCount;
    if (base === 0) {
      return {
        outcome: 'rejected',
        yesCount: 0,
        noCount: 0,
        totalEligible,
        detail: 'All voters abstained',
      };
    }

    if (yesCount / base > 0.5) {
      return {
        outcome: 'accepted',
        yesCount,
        noCount,
        totalEligible,
        detail: `${String(yesCount)}/${String(base)} voted YES (majority required)`,
      };
    }

    return {
      outcome: 'rejected',
      yesCount,
      noCount,
      totalEligible,
      detail: `${String(yesCount)}/${String(base)} voted YES (majority not reached)`,
    };
  }

  private checkMetaRule(
    voters: ReturnType<typeof extractVotersFromMarkdown>,
    votes: ReturnType<typeof extractVotesFromMarkdown>,
    isDeadlinePassed: boolean,
  ): ConsentResult {
    const totalEligible = voters.length;
    const voteMap = new Map(votes.map((v) => [v.agentId, v.vote]));

    let hasHumanYes = false;
    let yesCount = 0;
    let noCount = 0;

    for (const voter of voters) {
      const cast = voteMap.get(voter.id);
      if (cast === 'YES') {
        yesCount++;
        if (voter.model === 'human') hasHumanYes = true;
      } else if (cast === 'NO') {
        noCount++;
        return {
          outcome: 'rejected',
          yesCount,
          noCount,
          totalEligible,
          detail: 'Unanimous YES required; at least one NO vote cast',
        };
      } else if (cast === 'ABSTAIN') {
        return {
          outcome: 'rejected',
          yesCount,
          noCount,
          totalEligible,
          detail: 'Unanimous YES required; at least one ABSTAIN vote cast',
        };
      } else if (isDeadlinePassed) {
        // silence after deadline counts as rejection for unanimous rule
        return {
          outcome: 'rejected',
          yesCount,
          noCount,
          totalEligible,
          detail: 'Unanimous YES required; at least one voter did not vote before deadline',
        };
      }
    }

    if (yesCount < totalEligible) {
      return {
        outcome: 'pending',
        yesCount,
        noCount,
        totalEligible,
        detail: `${String(totalEligible - yesCount)} voter(s) have not yet voted`,
      };
    }

    if (!hasHumanYes) {
      return {
        outcome: 'rejected',
        yesCount,
        noCount,
        totalEligible,
        detail: 'Unanimous YES reached but no human approval',
      };
    }

    return {
      outcome: 'accepted',
      yesCount,
      noCount,
      totalEligible,
      detail: 'Unanimous YES with human approval',
    };
  }
}
