import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AgentRegistry } from './agent-registry.js';
import { setupGracefulShutdown } from './agent-lifecycle.js';

describe('setupGracefulShutdown', () => {
  const signalHandlers: Record<string, (() => void)[]> = {};
  let deregisterMock: ReturnType<typeof vi.fn>;
  let exitMock: ReturnType<typeof vi.fn>;
  let mockRegistry: AgentRegistry;

  beforeEach(() => {
    signalHandlers['SIGTERM'] = [];
    signalHandlers['SIGINT'] = [];

    deregisterMock = vi.fn().mockResolvedValue(undefined);
    mockRegistry = {
      deregister: deregisterMock,
    } as unknown as AgentRegistry;

    vi.spyOn(process, 'on').mockImplementation(
      // @ts-expect-error - process.on has complex overloads, simplified for testing
      (event: string, handler: () => void) => {
        if (signalHandlers[event]) {
          signalHandlers[event].push(handler);
        }
        return process;
      },
    );

    exitMock = vi.fn();
    vi.spyOn(process, 'exit').mockImplementation(exitMock as unknown as () => never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should register SIGTERM and SIGINT handlers', () => {
    setupGracefulShutdown('agent-alpha', mockRegistry);

    expect(signalHandlers['SIGTERM']).toHaveLength(1);
    expect(signalHandlers['SIGINT']).toHaveLength(1);
  });

  it('should return a ShutdownController', () => {
    const controller = setupGracefulShutdown('agent-alpha', mockRegistry);

    expect(controller.isShutdownRequested()).toBe(false);
    expect(typeof controller.onShutdown).toBe('function');
  });

  it('should deregister agent on SIGTERM', async () => {
    setupGracefulShutdown('agent-alpha', mockRegistry);

    signalHandlers['SIGTERM'][0]();
    await vi.waitFor(() => {
      expect(deregisterMock).toHaveBeenCalledWith('agent-alpha');
    });
  });

  it('should deregister agent on SIGINT', async () => {
    setupGracefulShutdown('agent-alpha', mockRegistry);

    signalHandlers['SIGINT'][0]();
    await vi.waitFor(() => {
      expect(deregisterMock).toHaveBeenCalledWith('agent-alpha');
    });
  });

  it('should call process.exit(0) after deregistration', async () => {
    setupGracefulShutdown('agent-alpha', mockRegistry);

    signalHandlers['SIGTERM'][0]();
    await vi.waitFor(() => {
      expect(exitMock).toHaveBeenCalledWith(0);
    });
  });

  it('should not throw if deregister fails', async () => {
    deregisterMock.mockRejectedValue(new Error('already removed'));

    setupGracefulShutdown('agent-alpha', mockRegistry);

    signalHandlers['SIGTERM'][0]();
    await vi.waitFor(() => {
      expect(exitMock).toHaveBeenCalledWith(0);
    });
  });

  it('should only deregister once on double signal', async () => {
    setupGracefulShutdown('agent-alpha', mockRegistry);

    signalHandlers['SIGTERM'][0]();
    signalHandlers['SIGINT'][0]();
    await vi.waitFor(() => {
      expect(exitMock).toHaveBeenCalled();
    });

    expect(deregisterMock).toHaveBeenCalledTimes(1);
  });

  it('should report shutdown requested after signal', async () => {
    const controller = setupGracefulShutdown('agent-alpha', mockRegistry);

    expect(controller.isShutdownRequested()).toBe(false);

    signalHandlers['SIGTERM'][0]();
    await vi.waitFor(() => {
      expect(controller.isShutdownRequested()).toBe(true);
    });
  });

  it('should invoke onShutdown callbacks on signal', async () => {
    const controller = setupGracefulShutdown('agent-alpha', mockRegistry);
    const callback = vi.fn();
    controller.onShutdown(callback);

    signalHandlers['SIGTERM'][0]();
    await vi.waitFor(() => {
      expect(callback).toHaveBeenCalled();
    });
  });
});
