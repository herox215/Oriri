import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initCommand } from '../cli/init.js';
import { FilesystemStorage } from '../storage/filesystem-storage.js';
import {
  A2ANotFoundError,
  PermissionDeniedError,
  VoteAlreadyCastError,
  VoteNotAllowedError,
} from '../shared/errors.js';
import { A2AService } from './a2a-service.js';
import { ConsentService } from './consent-service.js';
import { RoleService } from '../agents/role-service.js';

describe('ConsentService', () => {
  let testDir: string;
  let storage: FilesystemStorage;
  let a2aService: A2AService;
  let consentService: ConsentService;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'oriri-consent-test-'));
    await initCommand({ force: false, cwd: testDir });
    storage = new FilesystemStorage(join(testDir, '.oriri'));
    a2aService = new A2AService(storage);
    consentService = new ConsentService(storage, new RoleService());
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  async function createVotableA2A(opts?: {
    voters?: Array<{ id: string; model: string }>;
    deadline?: string;
    type?: 'rules_change' | 'merge_proposal';
  }): Promise<string> {
    return a2aService.createA2A({
      type: opts?.type ?? 'merge_proposal',
      createdBy: 'agent-alpha',
      description: 'Test proposal.',
      voters: opts?.voters ?? [
        { id: 'agent-alpha', model: 'claude-3-5-sonnet' },
        { id: 'agent-beta', model: 'claude-3-5-sonnet' },
        { id: 'agent-gamma', model: 'claude-3-5-sonnet' },
      ],
      deadline: opts?.deadline,
    });
  }

  describe('vote()', () => {
    it('should cast YES vote successfully', async () => {
      const id = await createVotableA2A();
      await consentService.vote(id, 'agent-alpha', 'CODER', 'YES');
      const content = await storage.readA2A(id);
      expect(content).toContain('| agent-alpha | YES |');
    });

    it('should cast NO vote successfully', async () => {
      const id = await createVotableA2A();
      await consentService.vote(id, 'agent-alpha', 'CODER', 'NO', 'Disagree');
      const content = await storage.readA2A(id);
      expect(content).toContain('| agent-alpha | NO |');
      expect(content).toContain('Disagree');
    });

    it('should cast ABSTAIN vote successfully', async () => {
      const id = await createVotableA2A();
      await consentService.vote(id, 'agent-alpha', 'CODER', 'ABSTAIN');
      const content = await storage.readA2A(id);
      expect(content).toContain('| agent-alpha | ABSTAIN |');
    });

    it('should append log entry on vote', async () => {
      const id = await createVotableA2A();
      await consentService.vote(id, 'agent-alpha', 'CODER', 'YES');
      const log = await storage.readA2ALog(id);
      expect(log).toContain('agent-alpha');
      expect(log).toContain('voted YES');
    });

    it('should throw VoteAlreadyCastError on second vote by same agent', async () => {
      const id = await createVotableA2A();
      await consentService.vote(id, 'agent-alpha', 'CODER', 'YES');
      await expect(consentService.vote(id, 'agent-alpha', 'CODER', 'NO')).rejects.toThrow(
        VoteAlreadyCastError,
      );
    });

    it('should throw PermissionDeniedError for OBSERVER role', async () => {
      const id = await createVotableA2A();
      await expect(consentService.vote(id, 'agent-observer', 'OBSERVER', 'YES')).rejects.toThrow(
        PermissionDeniedError,
      );
    });

    it('should throw VoteNotAllowedError on resolved A2A', async () => {
      const id = await createVotableA2A();
      await a2aService.resolveA2A(id, 'agent-alpha');
      await expect(consentService.vote(id, 'agent-alpha', 'CODER', 'YES')).rejects.toThrow(
        VoteNotAllowedError,
      );
    });

    it('should throw A2ANotFoundError for missing A2A', async () => {
      await expect(consentService.vote('nonexist', 'agent-alpha', 'CODER', 'YES')).rejects.toThrow(
        A2ANotFoundError,
      );
    });
  });

  describe('checkConsent()', () => {
    it('should return pending when no voters configured', async () => {
      const id = await a2aService.createA2A({
        type: 'agent_silent',
        createdBy: 'agent-alpha',
        description: 'No voters.',
      });
      const result = await consentService.checkConsent(id);
      expect(result.outcome).toBe('pending');
      expect(result.detail).toContain('No voters configured');
    });

    it('should return pending when deadline not passed and not all voted', async () => {
      const futureDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const id = await createVotableA2A({ deadline: futureDeadline });
      await consentService.vote(id, 'agent-alpha', 'CODER', 'YES');
      const result = await consentService.checkConsent(id);
      expect(result.outcome).toBe('pending');
    });

    it('should return accepted on explicit majority before deadline', async () => {
      const futureDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const id = await createVotableA2A({ deadline: futureDeadline });
      await consentService.vote(id, 'agent-alpha', 'CODER', 'YES');
      await consentService.vote(id, 'agent-beta', 'CODER', 'YES');
      await consentService.vote(id, 'agent-gamma', 'CODER', 'NO');
      const result = await consentService.checkConsent(id);
      expect(result.outcome).toBe('accepted');
      expect(result.yesCount).toBe(2);
      expect(result.noCount).toBe(1);
    });

    it('should return rejected on majority NO', async () => {
      const futureDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const id = await createVotableA2A({ deadline: futureDeadline });
      await consentService.vote(id, 'agent-alpha', 'CODER', 'NO');
      await consentService.vote(id, 'agent-beta', 'CODER', 'NO');
      await consentService.vote(id, 'agent-gamma', 'CODER', 'YES');
      const result = await consentService.checkConsent(id);
      expect(result.outcome).toBe('rejected');
    });

    it('should return rejected on 50:50 tie', async () => {
      const futureDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const id = await createVotableA2A({
        deadline: futureDeadline,
        voters: [
          { id: 'agent-alpha', model: 'claude-3-5-sonnet' },
          { id: 'agent-beta', model: 'claude-3-5-sonnet' },
        ],
      });
      await consentService.vote(id, 'agent-alpha', 'CODER', 'YES');
      await consentService.vote(id, 'agent-beta', 'CODER', 'NO');
      const result = await consentService.checkConsent(id);
      expect(result.outcome).toBe('rejected');
    });

    it('should count silent voters as YES after deadline', async () => {
      const pastDeadline = new Date(Date.now() - 1000).toISOString();
      const id = await createVotableA2A({ deadline: pastDeadline });
      // No votes cast — all 3 silent agents count as YES
      const result = await consentService.checkConsent(id);
      expect(result.outcome).toBe('accepted');
      expect(result.yesCount).toBe(3);
    });

    it('should return accepted on majority after deadline with some explicit YES', async () => {
      const pastDeadline = new Date(Date.now() - 1000).toISOString();
      const id = await createVotableA2A({ deadline: pastDeadline });
      await consentService.vote(id, 'agent-alpha', 'CODER', 'NO');
      // agent-beta and agent-gamma are silent → count as YES
      // 2 YES, 1 NO → accepted
      const result = await consentService.checkConsent(id);
      expect(result.outcome).toBe('accepted');
    });

    it('should return rejected when ABSTAIN reduces base to make YES minority', async () => {
      const futureDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const id = await createVotableA2A({ deadline: futureDeadline });
      await consentService.vote(id, 'agent-alpha', 'CODER', 'YES');
      await consentService.vote(id, 'agent-beta', 'CODER', 'NO');
      await consentService.vote(id, 'agent-gamma', 'CODER', 'ABSTAIN');
      // base = 2 (alpha YES, beta NO, gamma excluded), 1/2 = 50% → rejected
      const result = await consentService.checkConsent(id);
      expect(result.outcome).toBe('rejected');
    });
  });

  describe('checkConsent() — meta-rule (rules_change)', () => {
    const rulesVoters = [
      { id: 'agent-alpha', model: 'claude-3-5-sonnet' },
      { id: 'agent-human', model: 'human' },
    ];

    it('should return accepted on unanimous YES with human approval', async () => {
      const futureDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const id = await createVotableA2A({
        type: 'rules_change',
        voters: rulesVoters,
        deadline: futureDeadline,
      });
      await consentService.vote(id, 'agent-alpha', 'CODER', 'YES');
      await consentService.vote(id, 'agent-human', 'GENERALIST', 'YES');
      const result = await consentService.checkConsent(id);
      expect(result.outcome).toBe('accepted');
    });

    it('should return pending when not all have voted yet', async () => {
      const futureDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const id = await createVotableA2A({
        type: 'rules_change',
        voters: rulesVoters,
        deadline: futureDeadline,
      });
      await consentService.vote(id, 'agent-alpha', 'CODER', 'YES');
      const result = await consentService.checkConsent(id);
      expect(result.outcome).toBe('pending');
    });

    it('should return rejected if any voter said NO', async () => {
      const futureDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const id = await createVotableA2A({
        type: 'rules_change',
        voters: rulesVoters,
        deadline: futureDeadline,
      });
      await consentService.vote(id, 'agent-alpha', 'CODER', 'NO');
      await consentService.vote(id, 'agent-human', 'GENERALIST', 'YES');
      const result = await consentService.checkConsent(id);
      expect(result.outcome).toBe('rejected');
    });

    it('should return rejected if any voter said ABSTAIN', async () => {
      const futureDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const id = await createVotableA2A({
        type: 'rules_change',
        voters: rulesVoters,
        deadline: futureDeadline,
      });
      await consentService.vote(id, 'agent-alpha', 'CODER', 'ABSTAIN');
      await consentService.vote(id, 'agent-human', 'GENERALIST', 'YES');
      const result = await consentService.checkConsent(id);
      expect(result.outcome).toBe('rejected');
    });

    it('should return rejected if all voted YES but no human', async () => {
      const futureDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const aiOnlyVoters = [
        { id: 'agent-alpha', model: 'claude-3-5-sonnet' },
        { id: 'agent-beta', model: 'claude-3-5-sonnet' },
      ];
      const id = await createVotableA2A({
        type: 'rules_change',
        voters: aiOnlyVoters,
        deadline: futureDeadline,
      });
      await consentService.vote(id, 'agent-alpha', 'CODER', 'YES');
      await consentService.vote(id, 'agent-beta', 'CODER', 'YES');
      const result = await consentService.checkConsent(id);
      expect(result.outcome).toBe('rejected');
      expect(result.detail).toContain('human');
    });

    it('should return rejected when deadline passed with silence', async () => {
      const pastDeadline = new Date(Date.now() - 1000).toISOString();
      const id = await createVotableA2A({
        type: 'rules_change',
        voters: rulesVoters,
        deadline: pastDeadline,
      });
      await consentService.vote(id, 'agent-alpha', 'CODER', 'YES');
      // agent-human is silent after deadline → rejected for unanimous rule
      const result = await consentService.checkConsent(id);
      expect(result.outcome).toBe('rejected');
    });
  });
});
