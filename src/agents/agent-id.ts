import { createHash } from 'node:crypto';

export function generateAgentId(providerName: string): string {
  const input = `${providerName}:${String(Date.now())}:${String(Math.random())}`;
  const hash = createHash('sha256').update(input).digest('hex');
  return `${providerName}-${hash.slice(0, 4)}`;
}
