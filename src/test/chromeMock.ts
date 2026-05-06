import { vi } from 'vitest';

globalThis.chrome = {
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn()
    }
  },
  tabs: {
    create: vi.fn(),
    query: vi.fn()
  },
  runtime: {
    onMessage: { addListener: vi.fn() },
    sendMessage: vi.fn()
  },
  webNavigation: {
    onCommitted: { addListener: vi.fn() }
  }
} as unknown as typeof chrome;
