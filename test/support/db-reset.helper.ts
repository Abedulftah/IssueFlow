import { DataSource } from 'typeorm';

let cachedTableList: string | null = null;

function buildTableList(dataSource: DataSource): string {
  if (cachedTableList) return cachedTableList;
  const names = dataSource.entityMetadatas
    .map((m) => `"${m.tableName}"`)
    .join(', ');
  cachedTableList = names;
  return names;
}

export async function resetDatabase(dataSource: DataSource): Promise<void> {
  const tables = buildTableList(dataSource);
  if (!tables) return;
  await dataSource.query(
    `TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`,
  );
}

export function invalidateTableListCache(): void {
  cachedTableList = null;
}
