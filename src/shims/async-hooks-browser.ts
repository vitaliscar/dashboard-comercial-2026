// Browser-safe stand-in for Node's `node:async_hooks` module.
//
// @tanstack/react-start's client bundle transitively imports AsyncLocalStorage
// (via @tanstack/start-storage-context, used server-side for request context).
// The client code path never actually calls .run()/.getStore() with real request
// data, but it DOES `new AsyncLocalStorage()` at module init. Vite's default
// browser stub for node builtins is an empty object, so that constructor call
// throws "AsyncLocalStorage is not a constructor" during client hydration —
// which silently kills the entire hydrateRoot() bootstrap (no React, no 3D logo,
// login form falls back to a native POST).
//
// This is aliased ONLY for the client environment in vite.config.ts — the server
// build keeps Node's real, fully-reentrant AsyncLocalStorage.
export class AsyncLocalStorage<T = unknown> {
  private store: T | undefined;

  run<R>(store: T, callback: () => R): R {
    const previous = this.store;
    this.store = store;
    try {
      return callback();
    } finally {
      this.store = previous;
    }
  }

  getStore(): T | undefined {
    return this.store;
  }

  enterWith(store: T): void {
    this.store = store;
  }

  disable(): void {
    this.store = undefined;
  }
}
