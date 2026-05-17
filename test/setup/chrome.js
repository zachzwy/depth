import { vi } from 'vitest';

function createStorageArea() {
  let store = new Map();
  return {
    _store: store,
    get: vi.fn((keys) => {
      const out = {};
      const asArray = Array.isArray(keys)
        ? keys
        : typeof keys === 'string'
          ? [keys]
          : keys && typeof keys === 'object'
            ? Object.keys(keys)
            : null;
      if (asArray) {
        for (const k of asArray) {
          if (store.has(k)) out[k] = store.get(k);
          else if (keys && typeof keys === 'object' && !Array.isArray(keys)) out[k] = keys[k];
        }
      } else {
        for (const [k, v] of store.entries()) out[k] = v;
      }
      return Promise.resolve(out);
    }),
    set: vi.fn((patch) => {
      const changes = {};
      for (const [k, newValue] of Object.entries(patch)) {
        const oldValue = store.get(k);
        store.set(k, newValue);
        changes[k] = { oldValue, newValue };
      }
      for (const fn of changedListeners) fn(changes, 'local');
      return Promise.resolve();
    }),
    remove: vi.fn((keys) => {
      const arr = Array.isArray(keys) ? keys : [keys];
      for (const k of arr) store.delete(k);
      return Promise.resolve();
    }),
    clear: vi.fn(() => {
      store.clear();
      return Promise.resolve();
    }),
    _reset() {
      store.clear();
    },
  };
}

const changedListeners = new Set();

function createPermissions() {
  let granted = new Set();
  return {
    contains: vi.fn(({ origins } = {}) => {
      const list = origins ?? [];
      const ok = list.every((o) => granted.has(o));
      return Promise.resolve(ok);
    }),
    request: vi.fn(({ origins } = {}) => {
      for (const o of origins ?? []) granted.add(o);
      return Promise.resolve(true);
    }),
    remove: vi.fn(({ origins } = {}) => {
      for (const o of origins ?? []) granted.delete(o);
      return Promise.resolve(true);
    }),
    _grant(origin) {
      granted.add(origin);
    },
    _revokeAll() {
      granted.clear();
    },
  };
}

export function installChromeShim() {
  const local = createStorageArea();
  const sync = createStorageArea();
  const permissions = createPermissions();

  const messageListeners = new Set();
  const connectListeners = new Set();

  const chromeStub = {
    storage: {
      local,
      sync,
      onChanged: {
        addListener: (fn) => changedListeners.add(fn),
        removeListener: (fn) => changedListeners.delete(fn),
      },
    },
    permissions,
    runtime: {
      sendMessage: vi.fn(),
      openOptionsPage: vi.fn(),
      getURL: vi.fn((path) => `chrome-extension://test/${path}`),
      getManifest: vi.fn(() => ({ options_page: 'src/options/options.html' })),
      onMessage: {
        addListener: (fn) => messageListeners.add(fn),
        removeListener: (fn) => messageListeners.delete(fn),
      },
      onConnect: {
        addListener: (fn) => connectListeners.add(fn),
        removeListener: (fn) => connectListeners.delete(fn),
      },
      connect: vi.fn(),
    },
    tabs: {
      query: vi.fn(() => Promise.resolve([])),
      sendMessage: vi.fn(() => Promise.resolve()),
      create: vi.fn(() => Promise.resolve()),
    },
    scripting: {
      executeScript: vi.fn(() => Promise.resolve()),
    },
    action: {
      onClicked: { addListener: vi.fn() },
    },
    commands: {
      onCommand: { addListener: vi.fn() },
    },
    _messageListeners: messageListeners,
    _connectListeners: connectListeners,
  };

  globalThis.chrome = chromeStub;
  return chromeStub;
}

export function resetChromeShim() {
  changedListeners.clear();
  globalThis.chrome?.storage?.local?._reset?.();
  globalThis.chrome?.storage?.sync?._reset?.();
  globalThis.chrome?.permissions?._revokeAll?.();
}
