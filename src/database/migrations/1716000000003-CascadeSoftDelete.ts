import { MigrationInterface, QueryRunner } from 'typeorm';

export class CascadeSoftDelete1716000000003 implements MigrationInterface {
  name = 'CascadeSoftDelete1716000000003';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE attachments ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ NULL`);
    await queryRunner.query(`ALTER TABLE comments ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE comments DROP COLUMN IF EXISTS "deletedAt"`);
    await queryRunner.query(`ALTER TABLE attachments DROP COLUMN IF EXISTS "deletedAt"`);
  }
}
