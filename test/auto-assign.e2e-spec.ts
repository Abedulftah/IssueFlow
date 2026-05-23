import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../src/users/user.entity';
import { AuditLog } from '../src/audit-log/entities/audit-log.entity';
import { TicketPriority, TicketStatus, TicketType } from '../src/tickets/enums';
import {
  bootstrapTestApp,
  closeTestApp,
  TestAppContext,
} from './support/test-app.bootstrap';
import { resetDatabase } from './support/db-reset.helper';

describe('Auto-Assignment & Workload (e2e)', () => {
  let ctx: TestAppContext;
  let app: INestApplication;
  let adminToken: string;
  let adminUserId: number;
  let projectId: number;
  let userRepo: Repository<User>;
  let auditLogRepo: Repository<AuditLog>;

  async function createUser(
    username: string,
    role: UserRole,
  ): Promise<{ id: number }> {
    const res = await request(app.getHttpServer())
      .post('/users')
      .send({ username, email: `${username}@test.com`, fullName: username, role })
      .expect(200);
    return { id: res.body.id };
  }

  async function ensureAllDevsHaveTicketInProject(projId: number): Promise<void> {
    const devs = await userRepo.find({ where: { role: UserRole.DEVELOPER } });
    for (const dev of devs) {
      await createTicketForUser(projId, dev.id);
    }
  }

  async function createTicketForUser(
    projId: number,
    assigneeId: number,
    status: TicketStatus = TicketStatus.TODO,
  ): Promise<number> {
    const res = await request(app.getHttpServer())
      .post('/tickets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: `Ticket for ${assigneeId}`,
        priority: TicketPriority.LOW,
        type: TicketType.TECHNICAL,
        projectId: projId,
        assigneeId,
      })
      .expect(200);
    const ticketId: number = res.body.id;

    if (status !== TicketStatus.TODO) {
      if (status === TicketStatus.IN_PROGRESS || status === TicketStatus.IN_REVIEW || status === TicketStatus.DONE) {
        await request(app.getHttpServer())
          .patch(`/tickets/${ticketId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ status: TicketStatus.IN_PROGRESS })
          .expect(200);
      }
      if (status === TicketStatus.IN_REVIEW || status === TicketStatus.DONE) {
        await request(app.getHttpServer())
          .patch(`/tickets/${ticketId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ status: TicketStatus.IN_REVIEW })
          .expect(200);
      }
      if (status === TicketStatus.DONE) {
        await request(app.getHttpServer())
          .patch(`/tickets/${ticketId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ status: TicketStatus.DONE })
          .expect(200);
      }
    }
    return ticketId;
  }

  beforeAll(async () => {
    ctx = await bootstrapTestApp();
    app = ctx.app;
    userRepo = ctx.moduleRef.get(getRepositoryToken(User));
    auditLogRepo = ctx.moduleRef.get(getRepositoryToken(AuditLog));

    await resetDatabase(ctx.dataSource);

    const adminRes = await createUser('aa_admin', UserRole.ADMIN);
    adminUserId = adminRes.id;

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'aa_admin', password: 'secret' })
      .expect(200);
    adminToken = loginRes.body.accessToken;

    const projRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'AA Project', description: 'auto-assign e2e', ownerId: adminUserId })
      .expect(200);
    projectId = projRes.body.id;
  });

  afterAll(async () => {
    await resetDatabase(ctx.dataSource);
    await closeTestApp(ctx);
  });

  // ── Auto-Assignment on creation ───────────────────────────────────────────

  describe('Auto-assignment on POST /tickets (no assigneeId)', () => {
    it('6.4b: assigneeId is null when no DEVELOPERs are linked to the project (no prior ticket assignments)', async () => {
      await createUser('aa_dev_zero', UserRole.DEVELOPER);

      const freshProjRes = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Empty Project 64b', description: 'no linked devs', ownerId: adminUserId })
        .expect(200);
      const freshProjId = freshProjRes.body.id;

      const res = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'No linked dev ticket',
          priority: TicketPriority.LOW,
          type: TicketType.TECHNICAL,
          projectId: freshProjId,
        })
        .expect(200);

      expect(res.body.assigneeId).toBeNull();
    });

    it('6.2: selects DEVELOPER with fewest non-DONE tickets when multiple candidates exist', async () => {
      const freshProjRes = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Workload Project 62', description: 'workload', ownerId: adminUserId })
        .expect(200);
      const freshProjId = freshProjRes.body.id;

      // Give all currently existing DEVELOPERs 2 tickets in this project (links them)
      await ensureAllDevsHaveTicketInProject(freshProjId);
      await ensureAllDevsHaveTicketInProject(freshProjId);

      // New DEVELOPER linked with only 1 ticket — uniquely least-loaded
      const { id: lightestDev } = await createUser('aa_dev_lightest', UserRole.DEVELOPER);
      await createTicketForUser(freshProjId, lightestDev);

      const res = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Should go to lightest dev',
          priority: TicketPriority.LOW,
          type: TicketType.TECHNICAL,
          projectId: freshProjId,
        })
        .expect(200);

      expect(res.body.assigneeId).toBe(lightestDev);
    });

    it('6.3: tie-breaking — DEVELOPER with earlier createdAt is assigned when counts are equal', async () => {
      const freshProjRes = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Tie Break Project', description: 'tie', ownerId: adminUserId })
        .expect(200);
      const tieProj = freshProjRes.body.id;

      // Give all currently existing DEVELOPERs 2 tickets so they are above the tied candidates
      await ensureAllDevsHaveTicketInProject(tieProj);
      await ensureAllDevsHaveTicketInProject(tieProj);

      // Create two new DEVELOPERs sequentially — earlyTie.createdAt < lateTie.createdAt
      const { id: earlyTieId } = await createUser('tie_dev_early', UserRole.DEVELOPER);
      const { id: lateTieId } = await createUser('tie_dev_late', UserRole.DEVELOPER);
      // Link both with exactly 1 ticket each (tied, fewer than the 2 held by older devs)
      await createTicketForUser(tieProj, earlyTieId);
      await createTicketForUser(tieProj, lateTieId);
      void lateTieId; // earlyTieId wins the tie-break (earlier createdAt)

      const res = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Tie break ticket',
          priority: TicketPriority.LOW,
          type: TicketType.TECHNICAL,
          projectId: tieProj,
        })
        .expect(200);

      expect(res.body.assigneeId).toBe(earlyTieId);
    });

    it('6.4: assigneeId is null when no DEVELOPER-role users exist in the system', async () => {
      // Delete all developers temporarily by using a fresh DB state is too destructive.
      // Instead, directly verify via the service that the query returns null when no devs.
      // We do this by querying directly: no DEVELOPER users exist? Not safe to delete users.
      // Approach: use the raw query approach — create isolated project, verify that when we
      // insert a ticket with an admin-only user list we get null.
      // Since we can't remove DEVELOPERs safely without affecting other tests, we verify
      // the null-path via repository: update all developers to ADMIN role temporarily.
      await userRepo.query(`UPDATE users SET role = 'ADMIN' WHERE role = 'DEVELOPER'`);

      const isolatedProjRes = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'No Dev Project', description: 'no dev', ownerId: adminUserId })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'No dev ticket',
          priority: TicketPriority.LOW,
          type: TicketType.TECHNICAL,
          projectId: isolatedProjRes.body.id,
        })
        .expect(200);

      expect(res.body.assigneeId).toBeNull();

      // Restore developer roles
      await userRepo.query(`UPDATE users SET role = 'DEVELOPER' WHERE username != 'aa_admin'`);
    });

    it('6.5: explicit assigneeId on creation skips auto-assignment', async () => {
      const { id: explicitDev } = await createUser('aa_dev_explicit', UserRole.DEVELOPER);

      const res = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Explicit assign ticket',
          priority: TicketPriority.LOW,
          type: TicketType.TECHNICAL,
          projectId,
          assigneeId: explicitDev,
        })
        .expect(200);

      expect(res.body.assigneeId).toBe(explicitDev);
    });

    it('6.6: PATCH /tickets/:id with assigneeId overrides without triggering auto-assignment', async () => {
      const { id: patchDev } = await createUser('aa_dev_patch', UserRole.DEVELOPER);

      const createRes = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Patch assign ticket',
          priority: TicketPriority.LOW,
          type: TicketType.TECHNICAL,
          projectId,
          assigneeId: adminUserId,
        })
        .expect(200);
      const ticketId = createRes.body.id;

      const auditCountBefore = await auditLogRepo.count({
        where: { action: 'AUTO_ASSIGN', entityId: String(ticketId) },
      });

      await request(app.getHttpServer())
        .patch(`/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ assigneeId: patchDev })
        .expect(200);

      const patchRes = await request(app.getHttpServer())
        .get(`/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(patchRes.body.assigneeId).toBe(patchDev);

      const auditCountAfter = await auditLogRepo.count({
        where: { action: 'AUTO_ASSIGN', entityId: String(ticketId) },
      });
      expect(auditCountAfter).toBe(auditCountBefore);
    });
  });

  // ── Audit Log ─────────────────────────────────────────────────────────────

  describe('AUTO_ASSIGN audit log entry', () => {
    it('6.7: AUTO_ASSIGN audit log entry is created with actor = SYSTEM after auto-assignment', async () => {
      const auditProjRes = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Audit Assign Project', description: 'audit', ownerId: adminUserId })
        .expect(200);
      const auditProjId = auditProjRes.body.id;

      // Give all currently existing DEVELOPERs 2 tickets so auditDev (with 1) is uniquely least-loaded
      await ensureAllDevsHaveTicketInProject(auditProjId);
      await ensureAllDevsHaveTicketInProject(auditProjId);
      const { id: auditDev } = await createUser('aa_dev_audit', UserRole.DEVELOPER);
      await createTicketForUser(auditProjId, auditDev);

      const res = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Audit auto-assign',
          priority: TicketPriority.LOW,
          type: TicketType.TECHNICAL,
          projectId: auditProjId,
        })
        .expect(200);
      const ticketId = res.body.id;

      expect(res.body.assigneeId).toBe(auditDev);

      const log = await auditLogRepo.findOne({
        where: { action: 'AUTO_ASSIGN', entityId: String(ticketId) },
      });
      expect(log).not.toBeNull();
      expect(log!.actor).toBe('SYSTEM');
      expect(log!.performedBy).toBe('SYSTEM');
    });

    it('6.8: no AUTO_ASSIGN audit log entry when explicit assigneeId is provided', async () => {
      const { id: explDev } = await createUser('aa_dev_noaudit', UserRole.DEVELOPER);

      const res = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Explicit no audit',
          priority: TicketPriority.LOW,
          type: TicketType.TECHNICAL,
          projectId,
          assigneeId: explDev,
        })
        .expect(200);
      const ticketId = res.body.id;

      const log = await auditLogRepo.findOne({
        where: { action: 'AUTO_ASSIGN', entityId: String(ticketId) },
      });
      expect(log).toBeNull();
    });
  });

  // ── GET /projects/:projectId/workload ──────────────────────────────────────

  describe('GET /projects/:projectId/workload', () => {
    let wlProjId: number;
    let wlDev1Id: number;
    let wlDev2Id: number;

    beforeAll(async () => {
      const { id: d1 } = await createUser('wl_dev1', UserRole.DEVELOPER);
      const { id: d2 } = await createUser('wl_dev2', UserRole.DEVELOPER);
      wlDev1Id = d1;
      wlDev2Id = d2;

      const projRes = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Workload Test Project', description: 'wl', ownerId: adminUserId })
        .expect(200);
      wlProjId = projRes.body.id;

      // dev1 gets 3 open tickets, dev2 gets 1 open + 1 DONE
      await createTicketForUser(wlProjId, wlDev1Id);
      await createTicketForUser(wlProjId, wlDev1Id);
      await createTicketForUser(wlProjId, wlDev1Id);
      await createTicketForUser(wlProjId, wlDev2Id);
      await createTicketForUser(wlProjId, wlDev2Id, TicketStatus.DONE);
    });

    it('6.13: returns 401 without token', () => {
      return request(app.getHttpServer())
        .get(`/projects/${wlProjId}/workload`)
        .expect(401);
    });

    it('6.12: returns 404 for non-existent project', () => {
      return request(app.getHttpServer())
        .get('/projects/999999/workload')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('6.9: returns [{ userId, username, openTicketCount }] sorted ascending', async () => {
      const res = await request(app.getHttpServer())
        .get(`/projects/${wlProjId}/workload`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);

      const wl1 = res.body.find((e: any) => e.userId === wlDev1Id);
      const wl2 = res.body.find((e: any) => e.userId === wlDev2Id);

      expect(wl1).toBeDefined();
      expect(wl1.username).toBe('wl_dev1');
      expect(wl2).toBeDefined();
      expect(wl2.username).toBe('wl_dev2');

      // Sorted ascending: dev2 (1 open) should come before dev1 (3 open)
      const idx1 = res.body.findIndex((e: any) => e.userId === wlDev1Id);
      const idx2 = res.body.findIndex((e: any) => e.userId === wlDev2Id);
      expect(idx2).toBeLessThan(idx1);
    });

    it('6.10: DONE tickets are excluded from openTicketCount', async () => {
      const res = await request(app.getHttpServer())
        .get(`/projects/${wlProjId}/workload`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const wl2 = res.body.find((e: any) => e.userId === wlDev2Id);
      // dev2 has 1 open + 1 DONE → only 1 should count
      expect(wl2.openTicketCount).toBe(1);
    });

    it('6.11: DEVELOPERs not linked to the project do not appear in the workload', async () => {
      // Create a DEVELOPER who has no tickets in wlProjId — not linked, should not appear
      const { id: zeroDev } = await createUser('wl_dev_zero', UserRole.DEVELOPER);

      const res = await request(app.getHttpServer())
        .get(`/projects/${wlProjId}/workload`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const zeroEntry = res.body.find((e: any) => e.userId === zeroDev);
      expect(zeroEntry).toBeUndefined();
    });

    it('6.11b: returns [] when no DEVELOPER-role users exist in the system', async () => {
      // Temporarily promote all DEVELOPERs to ADMIN
      await userRepo.query(`UPDATE users SET role = 'ADMIN' WHERE role = 'DEVELOPER'`);

      const res = await request(app.getHttpServer())
        .get(`/projects/${wlProjId}/workload`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toEqual([]);

      // Restore
      await userRepo.query(`UPDATE users SET role = 'DEVELOPER' WHERE username != 'aa_admin'`);
    });
  });
});
