import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../src/users/user.entity';
import { AuditLog } from '../src/audit-log/entities/audit-log.entity';
import { ActorType } from '../src/audit-log/enums/actor-type.enum';
import { TicketPriority, TicketType } from '../src/tickets/enums';
import {
  bootstrapTestApp,
  closeTestApp,
  TestAppContext,
} from './support/test-app.bootstrap';
import { resetDatabase } from './support/db-reset.helper';

describe('AuditLog API (e2e)', () => {
  let ctx: TestAppContext;
  let app: INestApplication;
  let userRepo: Repository<User>;
  let auditLogRepo: Repository<AuditLog>;
  let accessToken: string;
  let testUserId: number;
  let testProjectId: number;

  beforeAll(async () => {
    ctx = await bootstrapTestApp();
    app = ctx.app;
    await resetDatabase(ctx.dataSource);

    userRepo = ctx.moduleRef.get(getRepositoryToken(User));
    auditLogRepo = ctx.moduleRef.get(getRepositoryToken(AuditLog));

    // Create admin user
    const createRes = await request(app.getHttpServer())
      .post('/users')
      .send({ username: 'auditadmin', email: 'auditadmin@test.com', fullName: 'Audit Admin', role: UserRole.ADMIN })
      .expect(200);
    testUserId = createRes.body.id;

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'auditadmin', password: 'secret' })
      .expect(200);
    accessToken = loginRes.body.accessToken;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Audit Test Project', description: 'e2e', ownerId: testUserId })
      .expect(200);
    testProjectId = projectRes.body.id;
  });

  afterAll(async () => {
    await resetDatabase(ctx.dataSource);
    await closeTestApp(ctx);
  });

  // ── GET /audit-logs ───────────────────────────────────────────────────────

  describe('GET /audit-logs', () => {
    it('returns 401 when no token is provided', () => {
      return request(app.getHttpServer()).get('/audit-logs').expect(401);
    });

    it('returns 200 with a plain array when authenticated', async () => {
      const res = await request(app.getHttpServer())
        .get('/audit-logs')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('returns entries with the expected shape', async () => {
      const res = await request(app.getHttpServer())
        .get('/audit-logs')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      if (res.body.length > 0) {
        const entry = res.body[0];
        expect(entry).toHaveProperty('id');
        expect(entry).toHaveProperty('action');
        expect(entry).toHaveProperty('entityType');
        expect(entry).toHaveProperty('entityId');
        expect(entry).toHaveProperty('performedBy');
        expect(entry).toHaveProperty('actor');
        expect(entry).toHaveProperty('timestamp');
      }
    });

    it('filters by entityType=Project', async () => {
      const res = await request(app.getHttpServer())
        .get('/audit-logs?entityType=PROJECT')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.every((e: AuditLog) => e.entityType === 'PROJECT')).toBe(true);
    });

    it('filters by actor=USER', async () => {
      const res = await request(app.getHttpServer())
        .get('/audit-logs?actor=USER')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.every((e: AuditLog) => e.actor === ActorType.USER)).toBe(true);
    });

    it('filters by action=CREATE', async () => {
      const res = await request(app.getHttpServer())
        .get('/audit-logs?action=CREATE')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.every((e: AuditLog) => e.action === 'CREATE')).toBe(true);
    });

    it('filters by entityId', async () => {
      const res = await request(app.getHttpServer())
        .get(`/audit-logs?entityId=${testProjectId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.every((e: any) => e.entityId === testProjectId)).toBe(true);
    });
  });

  // ── Audit entries are created for state-changing actions ──────────────────

  describe('Audit entries for state-changing actions', () => {
    it('records a CREATE entry when a user is created', async () => {
      const before = await auditLogRepo.count({ where: { action: 'CREATE', entityType: 'USER' } });

      await request(app.getHttpServer())
        .post('/users')
        .send({ username: 'new_audit_user', email: 'new_audit@test.com', fullName: 'New Audit', role: UserRole.DEVELOPER })
        .expect(200);

      const after = await auditLogRepo.count({ where: { action: 'CREATE', entityType: 'USER' } });
      expect(after).toBe(before + 1);
    });

    it('records a CREATE entry when a project is created', async () => {
      const before = await auditLogRepo.count({ where: { action: 'CREATE', entityType: 'PROJECT' } });

      await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Audit Project 2', description: 'x', ownerId: testUserId })
        .expect(200);

      const after = await auditLogRepo.count({ where: { action: 'CREATE', entityType: 'PROJECT' } });
      expect(after).toBe(before + 1);
    });

    it('records a CREATE entry when a ticket is created, with performedBy = requesting user', async () => {
      const res = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Audit ticket', priority: TicketPriority.LOW, type: TicketType.TECHNICAL, projectId: testProjectId })
        .expect(200);
      const tktId = res.body.id;

      const entries = await auditLogRepo.find({
        where: { action: 'CREATE', entityType: 'TICKET', entityId: String(tktId) },
      });
      expect(entries.length).toBe(1);
      expect(entries[0].performedBy).toBe(String(testUserId));
    });

    it('records exactly one CREATE entry per ticket (no duplicates from trigger + manual call)', async () => {
      const res = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'No-duplicate audit ticket', priority: TicketPriority.LOW, type: TicketType.TECHNICAL, projectId: testProjectId })
        .expect(200);
      const tktId = res.body.id;

      const count = await auditLogRepo.count({
        where: { action: 'CREATE', entityType: 'TICKET', entityId: String(tktId) },
      });
      expect(count).toBe(1);
    });

    it('records an UPDATE entry when a ticket is updated', async () => {
      const tktRes = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Update audit ticket', priority: TicketPriority.LOW, type: TicketType.TECHNICAL, projectId: testProjectId })
        .expect(200);
      const tktId = tktRes.body.id;

      const before = await auditLogRepo.count({ where: { action: 'UPDATE', entityType: 'TICKET', entityId: String(tktId) } });

      await request(app.getHttpServer())
        .patch(`/tickets/${tktId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Updated' })
        .expect(200);

      const after = await auditLogRepo.count({ where: { action: 'UPDATE', entityType: 'TICKET', entityId: String(tktId) } });
      expect(after).toBe(before + 1);
    });

    it('records a DELETE entry (not SOFT_DELETE) when a ticket is soft-deleted', async () => {
      const tktRes = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Delete audit ticket', priority: TicketPriority.LOW, type: TicketType.TECHNICAL, projectId: testProjectId })
        .expect(200);
      const tktId = tktRes.body.id;

      await request(app.getHttpServer())
        .delete(`/tickets/${tktId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Trigger maps soft-delete (UPDATE sets deletedAt) to action='DELETE'
      const entries = await auditLogRepo.find({
        where: { action: 'DELETE', entityType: 'TICKET', entityId: String(tktId) },
      });
      expect(entries.length).toBe(1);
      expect(entries[0].performedBy).toBe(String(testUserId));
    });
  });

  // ── AUTO_ASSIGN audit entry ───────────────────────────────────────────────

  describe('AUTO_ASSIGN audit entry', () => {
    it('writes an AUTO_ASSIGN SYSTEM entry when a developer exists and no assigneeId is given', async () => {
      // Ensure a developer user exists
      await request(app.getHttpServer())
        .post('/users')
        .send({ username: 'aa_dev', email: 'aa_dev@test.com', fullName: 'AA Dev', role: UserRole.DEVELOPER })
        .expect(200);

      const ticketRes = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Auto assign audit', priority: TicketPriority.LOW, type: TicketType.TECHNICAL, projectId: testProjectId })
        .expect(200);

      const ticket = ticketRes.body;
      // Ticket should have been auto-assigned
      expect(ticket.assigneeId).toBeTruthy();

      const logsRes = await request(app.getHttpServer())
        .get(`/audit-logs?action=AUTO_ASSIGN&entityId=${ticket.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(logsRes.body.length).toBeGreaterThanOrEqual(1);
      const entry = logsRes.body[0];
      expect(entry.action).toBe('AUTO_ASSIGN');
      expect(entry.actor).toBe(ActorType.SYSTEM);
      expect(entry.performedBy).toBe('SYSTEM');
      expect(entry.entityType).toBe('TICKET');
    });

    it('does NOT write AUTO_ASSIGN when no DEVELOPERs exist globally', async () => {
      // Delete all developer users
      await userRepo.delete({ role: UserRole.DEVELOPER });

      const beforeCount = await auditLogRepo.count({ where: { action: 'AUTO_ASSIGN' } });

      await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'No dev audit', priority: TicketPriority.LOW, type: TicketType.TECHNICAL, projectId: testProjectId })
        .expect(200);

      const afterCount = await auditLogRepo.count({ where: { action: 'AUTO_ASSIGN' } });
      expect(afterCount).toBe(beforeCount);
    });
  });

  // ── ESCALATE audit entry (requires SchedulerModule) ──────────────────────

  describe.skip('ESCALATE audit entry (requires SchedulerModule)', () => {
    it('writes an ESCALATE SYSTEM entry for overdue tickets below CRITICAL', () => {
      // TODO: inject SchedulerService, call runEscalation(), assert ESCALATE audit entry
    });
  });
});
