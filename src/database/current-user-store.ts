import { AsyncLocalStorage } from 'async_hooks';

export const currentUserStore = new AsyncLocalStorage<number | undefined>();

export function runWithUser<T>(userId: number | undefined, fn: () => T): T {
  return currentUserStore.run(userId, fn);
}

export function getCurrentUserId(): number | undefined {
  return currentUserStore.getStore();
}
