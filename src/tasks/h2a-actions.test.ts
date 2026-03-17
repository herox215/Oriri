import { describe, it, expect } from 'vitest';
import { buildH2AContextBundle, parseH2AContextBundle } from './h2a-actions.js';
import type { H2APayload } from './h2a-actions.js';

describe('h2a-actions', () => {
  describe('build/parse round-trip', () => {
    it('round-trips a payload without reason', () => {
      const payload: H2APayload = { action: 'delete_task', targetId: 'T-001' };
      const bundle = buildH2AContextBundle(payload);
      const parsed = parseH2AContextBundle(bundle);

      expect(parsed).toEqual(payload);
    });

    it('round-trips a payload with reason', () => {
      const payload: H2APayload = {
        action: 'delete_task',
        targetId: 'T-042',
        reason: 'no longer needed',
      };
      const bundle = buildH2AContextBundle(payload);
      const parsed = parseH2AContextBundle(bundle);

      expect(parsed).toEqual(payload);
    });
  });

  describe('parseH2AContextBundle', () => {
    it('returns null for empty string', () => {
      expect(parseH2AContextBundle('')).toBeNull();
    });

    it('returns null for invalid action', () => {
      const bundle = '| action | unknown_action |\n| target_id | T-001 |';
      expect(parseH2AContextBundle(bundle)).toBeNull();
    });

    it('returns null when target_id is missing', () => {
      const bundle = '| action | delete_task |';
      expect(parseH2AContextBundle(bundle)).toBeNull();
    });
  });
});
