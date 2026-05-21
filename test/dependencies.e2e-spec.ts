import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { UserRole } from '../src/users/user.entity';
import { TicketPriority, TicketStatus, TicketType } from '../src/tickets/enums';
import {
  bootstrapTestApp,
  closeTestApp,
  TestAppContext,
} from './support/test-app.bootstrap';
import { resetDatabase } from './support/db-reset.helper';

describe('Dependencies API (e2e)', () => {
  let ctx: TestAppContext;
  let app: INestApplication;
  let adminToken: string;
  let adminUserId: number;
  let devUserId: number;
  let projectId: number;
  let otherProjectId: number;

  /** Helper: create a ticket and return its id */
  async function createTicket(
    title: string,
    opts: { projectId?: number } = {},
  ): Promise<number> {
    const res = await request(app.getHttpServer())
      .post('/tickets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title,
        priority: TicketPriority.LOW,
        type: TicketType.TECHNICAL,
        projectId: opts.projectId ?? projectId,
        assigneeId: devUserId,
      })
      .expect(200);
    return res.body.id;
  }

  /** Helper: advance a ticket through statuses to DONE */
  async function advanceToDone(ticketId: number): Promise<void> {
    const steps = [TicketStatus.IN_PROGRESS, TicketStatus.IN_REVIEW, TicketStatus.DONE];
    for (const status of steps) {
      await request(app.getHttpServer())
        .patch(`/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status })
        .expect(200);
    }
  }

  beforeAll(async () => {
    ctx = await bootstrapTestApp();
    app = ctx.app;
    await resetDatabase(ctx.dataSource);

    const adminRes = await request(app.getHttpServer())
      .post('/users')
      .send({ username: 'dep_admin', email: 'dep_admin@test.com', fullName: 'Dep Admin', role: UserRole.ADMIN })
      .expect(200);
    adminUserId = adminRes.body.id;

    const devRes = await request(app.getHttpServer())
      .post('/users')
      .send({ username: 'dep_dev', email: 'dep_dev@test.com', fullName: 'Dep Dev', role: UserRole.DEVELOPER })
      .expect(200);
    devUserId = devRes.body.id;

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'dep_admin', password: 'secret' })
      .expect(200);
    adminToken = loginRes.body.accessToken;

    const projRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Dep Test Project', description: 'e2e', ownerId: adminUserId })
      .expect(200);
    projectId = projRes.body.id;

    const otherProjRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Other Project', description: 'e2e', ownerId: adminUserId })
      .expect(200);
    otherProjectId = otherProjRes.body.id;
  });

  afterAll(async () => {
    await resetDatabase(ctx.dataSource);
    await closeTestApp(ctx);
  });

  // ── POST /tickets/:ticketId/dependencies ──────────────────────────────────

  describe('POST /tickets/:ticketId/dependencies', () => {
    it('returns 401 without token', async () => {
      const tid = await createTicket('auth test');
      const bid = await createTicket('blocker');

      return request(app.getHttpServer())
        .post(`/tickets/${tid}/dependencies`)
        .send({ blockedBy: bid })
        .expect(401);
    });

    it('adds a dependency and returns 201', async () => {
      const ticketId = await createTicket('blocked ticket');
      const blockerId = await createTicket('blocker ticket');

      await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/dependencies`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ blockedBy: blockerId })
        .expect(200);
    });

    it('returns 400 when a ticket tries to block itself', async () => {
      const ticketId = await createTicket('self blocker');

      return request(app.getHttpServer())
        .post(`/tickets/${ticketId}/dependencies`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ blockedBy: ticketId })
        .expect(400);
    });

    it('returns 400 when tickets belong to different projects', async () => {
      const ticketId = await createTicket('cross-project blocked');
      const crossBlocker = await createTicket('cross-project blocker', { projectId: otherProjectId });

      return request(app.getHttpServer())
        .post(`/tickets/${ticketId}/dependencies`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ blockedBy: crossBlocker })
        .expect(400);
    });

    it('returns 404 when the blocker ticket does not exist', async () => {
      const ticketId = await createTicket('ghost blocker');

      return request(app.getHttpServer())
        .post(`/tickets/${ticketId}/dependencies`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ blockedBy: 999999 })
        .expect(404);
    });

    it('returns 409 when the same dependency already exists', async () => {
      const ticketId = await createTicket('dup blocked');
      const blockerId = await createTicket('dup blocker');

      await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/dependencies`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ blockedBy: blockerId })
        .expect(200);

      return request(app.getHttpServer())
        .post(`/tickets/${ticketId}/dependencies`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ blockedBy: blockerId })
        .expect(409);
    });

    it('returns 400 when adding a dependency would create a cycle', async () => {
      // A blocks B, then B blocks A would be a cycle
      const aId = await createTicket('cycle A');
      const bId = await createTicket('cycle B');

      await request(app.getHttpServer())
        .post(`/tickets/${bId}/dependencies`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ blockedBy: aId })
        .expect(200);

      return request(app.getHttpServer())
        .post(`/tickets/${aId}/dependencies`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ blockedBy: bId })
        .expect(400);
    });

    it('returns 400 when adding a longer cycle would create a cycle (A→B→C→A)', async () => {
      // Create A -> B, B -> C, then C -> A should be rejected
      const aId = await createTicket('cycle3 A');
      const bId = await createTicket('cycle3 B');
      const cId = await createTicket('cycle3 C');

      await request(app.getHttpServer())
        .post(`/tickets/${bId}/dependencies`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ blockedBy: aId })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/tickets/${cId}/dependencies`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ blockedBy: bId })
        .expect(200);

      return request(app.getHttpServer())
        .post(`/tickets/${aId}/dependencies`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ blockedBy: cId })
        .expect(400);
    });
  });

  // ── GET /tickets/:ticketId/dependencies ───────────────────────────────────

  describe('GET /tickets/:ticketId/dependencies', () => {
    let blockedId: number;
    let blockerId: number;

    beforeAll(async () => {
      blockedId = await createTicket('listed blocked');
      blockerId = await createTicket('listed blocker');

      await request(app.getHttpServer())
        .post(`/tickets/${blockedId}/dependencies`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ blockedBy: blockerId })
        .expect(200);
    });

    it('returns 401 without token', () => {
      return request(app.getHttpServer())
        .get(`/tickets/${blockedId}/dependencies`)
        .expect(401);
    });

    it('returns a list of blockers with { id, title, status }', async () => {
      const res = await request(app.getHttpServer())
        .get(`/tickets/${blockedId}/dependencies`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const blocker = res.body.find((b: any) => b.id === blockerId);
      expect(blocker).toBeDefined();
      expect(blocker).toMatchObject({
        id: blockerId,
        title: 'listed blocker',
        status: TicketStatus.TODO,
      });
    });

    it('returns 404 for non-existent ticket', async () => {
      return request(app.getHttpServer())
        .get('/tickets/999999/dependencies')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  // ── DELETE /tickets/:ticketId/dependencies/:blockerId ─────────────────────

  describe('DELETE /tickets/:ticketId/dependencies/:blockerId', () => {
    let blockedId: number;
    let blockerId: number;

    beforeAll(async () => {
      blockedId = await createTicket('del-dep blocked');
      blockerId = await createTicket('del-dep blocker');

      await request(app.getHttpServer())
        .post(`/tickets/${blockedId}/dependencies`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ blockedBy: blockerId })
        .expect(200);
    });

    it('returns 401 without token', () => {
      return request(app.getHttpServer())
        .delete(`/tickets/${blockedId}/dependencies/${blockerId}`)
        .expect(401);
    });

    it('removes the dependency', async () => {
      await request(app.getHttpServer())
        .delete(`/tickets/${blockedId}/dependencies/${blockerId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/tickets/${blockedId}/dependencies`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.find((b: any) => b.id === blockerId)).toBeUndefined();
    });

    it('returns 404 when the dependency does not exist', async () => {
      return request(app.getHttpServer())
        .delete(`/tickets/${blockedId}/dependencies/999999`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  // ── DONE guard: cannot close with unresolved blockers ────────────────────

  describe('Cannot transition to DONE with unresolved blockers', () => {
    it('rejects IN_REVIEW → DONE when a blocker is not DONE', async () => {
      const blockedId = await createTicket('guarded ticket');
      const blockerId = await createTicket('unresolved blocker');

      // Add dependency
      await request(app.getHttpServer())
        .post(`/tickets/${blockedId}/dependencies`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ blockedBy: blockerId })
        .expect(200);

      // Advance blocked ticket to IN_REVIEW
      await request(app.getHttpServer())
        .patch(`/tickets/${blockedId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: TicketStatus.IN_PROGRESS })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/tickets/${blockedId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: TicketStatus.IN_REVIEW })
        .expect(200);

      // Try to mark DONE – blocker is still TODO
      await request(app.getHttpServer())
        .patch(`/tickets/${blockedId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: TicketStatus.DONE })
        .expect(400);
    });

    it('allows DONE when all blockers are already DONE', async () => {
      const blockedId = await createTicket('allowed guarded ticket');
      const blockerId = await createTicket('resolved blocker');

      await request(app.getHttpServer())
        .post(`/tickets/${blockedId}/dependencies`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ blockedBy: blockerId })
        .expect(200);

      // Resolve the blocker first
      await advanceToDone(blockerId);

      // Advance blocked to IN_REVIEW
      await request(app.getHttpServer())
        .patch(`/tickets/${blockedId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: TicketStatus.IN_PROGRESS })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/tickets/${blockedId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: TicketStatus.IN_REVIEW })
        .expect(200);

      // Now DONE should be allowed
      await request(app.getHttpServer())
        .patch(`/tickets/${blockedId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: TicketStatus.DONE })
        .expect(200);
    });
  });
});
