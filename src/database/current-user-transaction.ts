import { DataSource, EntityManager } from 'typeorm';
import { getCurrentUserId } from './current-user-store';

export async function withCurrentUserTransaction<T>(
  dataSource: DataSource,
  work: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  const userId = getCurrentUserId();
  return dataSource.transaction(async (manager) => {
    if (userId !== undefined) {
      await manager.query('SELECT set_config($1, $2, true)', [
        'issueflow.current_user_id',
        String(Number(userId)),
      ]);
    }
    return work(manager);
  });
}
