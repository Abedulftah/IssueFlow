import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { User, UserRole } from '../../src/users/user.entity';

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
  // Re-seed default admin so tests can authenticate with admin/admin
  const passwordHash = await bcrypt.hash('admin', 10);
  const admin = dataSource.getRepository(User).create({
    username: 'admin',
    email: 'admin@admin.com',
    fullName: 'admin',
    role: UserRole.ADMIN,
    passwordHash,
  });
  await dataSource.getRepository(User).save(admin);
}

export function invalidateTableListCache(): void {
  cachedTableList = null;
}
