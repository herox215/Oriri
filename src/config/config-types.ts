export const STORAGE_MODES = ['local', 'server', 'hybrid'] as const;

export type StorageMode = (typeof STORAGE_MODES)[number];

export interface OririConfig {
  mode: StorageMode;
}
