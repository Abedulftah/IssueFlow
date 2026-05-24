import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { UserRole } from '../src/users/user.entity';
import { TicketPriority, TicketType } from '../src/tickets/enums';
import { bootstrapTestApp, closeTestApp, TestAppContext } from './support/test-app.bootstrap';
import { resetDatabase } from './support/db-reset.helper';
import { getDefaultAdminToken } from './support/auth.helper';

describe('Dependencies API (e2e)', () => {
  let ctx: TestAppContext;
  let app: INestApplication;
  let token: string;
  let projectId: number;
  let otherProjectId: number;

  async function createTicket(title: string, pId = projectId): Promise<number> {
    const res = await request(app.getHttpServer())
      .post('/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({ title, priority: TicketPriority.MEDIUM, type: TicketType.TECHNICAL, projectId: pId })
      .expect(200);
    return res.body.id;
  }

  beforeAll(async () => {
    ctx = await bootstrapTestApp();
    app = ctx.app;
    await resetDatabase(ctx.dataSource);

    const defaultAdminToken = await getDefaultAdminToken(app);

    const userRes = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${defaultAdminToken}`)
      .send({ username: 'dep_admin', email: 'dep_admin@test.com', fullName: 'Dep Admin', role: UserRole.ADMIN, password: 'secret' })
      .expect(200);

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'dep_admin', password: 'secret' })
      .expect(200);
    token = loginRes.body.accessToken;

    const ownerId = userRes.body.id;

    const proj1 = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Dep Project', description: 'e2e', ownerId })
      .expect(200);
    projectId = proj1.body.id;

    const proj2 = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Other Project', description: 'e2e', ownerId })
      .expect(200);
    otherProjectId = proj2.body.id;
  });

  afterAll(async () => {
    await resetDatabase(ctx.dataSource);
    await closeTestApp(ctx);
  });

  // ── Auth guard ────────────────────────────────────────────────────────────

  describe('Auth guard', () => {
    it('GET /tickets/:id/dependencies returns 401 without token', async () => {
      const id = await createTicket('auth guard ticket');
      return request(app.getHttpServer()).get(`/tickets/${id}/dependencies`).expect(401);
    });

    it('POST /tickets/:id/dependencies returns 401 without token', async () => {
      const id = await createTicket('auth guard ticket 2');
      return request(app.getHttpServer())
        .post(`/tickets/${id}/dependencies`)
        .send({ blockedBy: id })
        .expect(401);
    });

    it('DELETE /tickets/:id/dependencies/:blockerId returns 401 without token', async () => {
      const id = await createTicket('auth guard ticket 3');
      return request(app.getHttpServer()).delete(`/tickets/${id}/dependencies/1`).expect(401);
    });
  });

  // ── GET /tickets/:id/dependencies ─────────────────────────────────────────

  describe('GET /tickets/:id/dependencies', () => {
    it('returns empty array when ticket has no blockers', async () => {
      const id = await createTicket('no blockers ticket');
      const res = await request(app.getHttpServer())
        .get(`/tickets/${id}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('returns 404 when ticket does not exist', () => {
      return request(app.getHttpServer())
        .get('/tickets/999999/dependencies')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('returns blockers with id, title, and status fields only', async () => {
      const blockedId = await createTicket('get-dep blocked');
      const blockerId = await createTicket('get-dep blocker');

      await request(app.getHttpServer())
        .post(`/tickets/${blockedId}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .send({ blockedBy: blockerId })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/tickets/${blockedId}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        id: blockerId,
        title: 'get-dep blocker',
        status: expect.any(String),
      });
      expect(Object.keys(res.body[0])).toEqual(expect.arrayContaining(['id', 'title', 'status']));
      expect(res.body[0].projectId).toBeUndefined();
    });
  });

  // ── POST /tickets/:id/dependencies ────────────────────────────────────────

  describe('POST /tickets/:id/dependencies', () => {
    it('returns 200 and adds a valid dependency', async () => {
      const blockedId = await createTicket('post-dep blocked');
      const blockerId = await createTicket('post-dep blocker');

      await request(app.getHttpServer())
        .post(`/tickets/${blockedId}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .send({ blockedBy: blockerId })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/tickets/${blockedId}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.map((b: any) => b.id)).toContain(blockerId);
    });

    it('returns 404 when the blocked ticket does not exist', () => {
      return request(app.getHttpServer())
        .post('/tickets/999999/dependencies')
        .set('Authorization', `Bearer ${token}`)
        .send({ blockedBy: 1 })
        .expect(404);
    });

    it('returns 404 when the blocker ticket does not exist', async () => {
      const blockedId = await createTicket('blocked ticket - blocker missing');
      return request(app.getHttpServer())
        .post(`/tickets/${blockedId}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .send({ blockedBy: 999999 })
        .expect(404);
    });

    it('returns 400 when a ticket tries to block itself', async () => {
      const id = await createTicket('self-block ticket');
      return request(app.getHttpServer())
        .post(`/tickets/${id}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .send({ blockedBy: id })
        .expect(400);
    });

    it('returns 400 when tickets belong to different projects', async () => {
      const blockedId = await createTicket('cross-project blocked', projectId);
      const blockerId = await createTicket('cross-project blocker', otherProjectId);

      return request(app.getHttpServer())
        .post(`/tickets/${blockedId}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .send({ blockedBy: blockerId })
        .expect(400);
    });

    it('returns 409 when the same dependency already exists', async () => {
      const blockedId = await createTicket('dup-dep blocked');
      const blockerId = await createTicket('dup-dep blocker');

      await request(app.getHttpServer())
        .post(`/tickets/${blockedId}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .send({ blockedBy: blockerId })
        .expect(200);

      return request(app.getHttpServer())
        .post(`/tickets/${blockedId}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .send({ blockedBy: blockerId })
        .expect(409);
    });

    it('returns 400 when adding a dependency would create a direct cycle (A→B, B→A)', async () => {
      const a = await createTicket('cycle-A');
      const b = await createTicket('cycle-B');

      // A is blocked by B
      await request(app.getHttpServer())
        .post(`/tickets/${a}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .send({ blockedBy: b })
        .expect(200);

      // B is blocked by A — would form a cycle
      return request(app.getHttpServer())
        .post(`/tickets/${b}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .send({ blockedBy: a })
        .expect(400);
    });

    it('returns 400 when adding a dependency would create a transitive cycle (A→B→C, C→A)', async () => {
      const a = await createTicket('trans-cycle-A');
      const b = await createTicket('trans-cycle-B');
      const c = await createTicket('trans-cycle-C');

      // A blocked by B
      await request(app.getHttpServer())
        .post(`/tickets/${a}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .send({ blockedBy: b })
        .expect(200);

      // B blocked by C
      await request(app.getHttpServer())
        .post(`/tickets/${b}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .send({ blockedBy: c })
        .expect(200);

      // C blocked by A — would close the cycle A←B←C←A
      return request(app.getHttpServer())
        .post(`/tickets/${c}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .send({ blockedBy: a })
        .expect(400);
    });

    it('returns 400 when blockedBy is missing or not an integer', async () => {
      const id = await createTicket('bad-body ticket');

      await request(app.getHttpServer())
        .post(`/tickets/${id}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);

      await request(app.getHttpServer())
        .post(`/tickets/${id}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .send({ blockedBy: 'not-a-number' })
        .expect(400);
    });

    it('allows a ticket to have multiple distinct blockers', async () => {
      const blocked = await createTicket('multi-blocker blocked');
      const blocker1 = await createTicket('multi-blocker 1');
      const blocker2 = await createTicket('multi-blocker 2');

      await request(app.getHttpServer())
        .post(`/tickets/${blocked}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .send({ blockedBy: blocker1 })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/tickets/${blocked}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .send({ blockedBy: blocker2 })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/tickets/${blocked}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const ids = res.body.map((b: any) => b.id);
      expect(ids).toContain(blocker1);
      expect(ids).toContain(blocker2);
    });
  });

  // ── DELETE /tickets/:id/dependencies/:blockerId ───────────────────────────

  describe('DELETE /tickets/:id/dependencies/:blockerId', () => {
    it('removes an existing dependency', async () => {
      const blockedId = await createTicket('del-dep blocked');
      const blockerId = await createTicket('del-dep blocker');

      await request(app.getHttpServer())
        .post(`/tickets/${blockedId}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .send({ blockedBy: blockerId })
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/tickets/${blockedId}/dependencies/${blockerId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/tickets/${blockedId}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.map((b: any) => b.id)).not.toContain(blockerId);
    });

    it('returns 404 when the blocked ticket does not exist', () => {
      return request(app.getHttpServer())
        .delete('/tickets/999999/dependencies/1')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('returns 404 when the dependency does not exist on the ticket', async () => {
      const blockedId = await createTicket('del-dep no link');
      const unrelatedId = await createTicket('del-dep unrelated');

      return request(app.getHttpServer())
        .delete(`/tickets/${blockedId}/dependencies/${unrelatedId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('only removes the targeted blocker, leaving others intact', async () => {
      const blocked = await createTicket('del-partial blocked');
      const keep = await createTicket('del-partial keep');
      const remove = await createTicket('del-partial remove');

      await request(app.getHttpServer())
        .post(`/tickets/${blocked}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .send({ blockedBy: keep })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/tickets/${blocked}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .send({ blockedBy: remove })
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/tickets/${blocked}/dependencies/${remove}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/tickets/${blocked}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const ids = res.body.map((b: any) => b.id);
      expect(ids).toContain(keep);
      expect(ids).not.toContain(remove);
    });

    it('allows a new dependency to be added after removal (no phantom cycle)', async () => {
      const blocked = await createTicket('re-add blocked');
      const blocker = await createTicket('re-add blocker');

      await request(app.getHttpServer())
        .post(`/tickets/${blocked}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .send({ blockedBy: blocker })
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/tickets/${blocked}/dependencies/${blocker}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/tickets/${blocked}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .send({ blockedBy: blocker })
        .expect(200);
    });
  });

  // ── Blocker prevents DONE transition ─────────────────────────────────────

  describe('Blocker prevents DONE transition', () => {
    it('returns 400 when attempting DONE with an unresolved (non-DONE) blocker', async () => {
      const blocker = await createTicket('blocker-not-done');
      const blocked = await createTicket('blocked-by-non-done');

      // Link: blocked is blocked by blocker
      await request(app.getHttpServer())
        .post(`/tickets/${blocked}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .send({ blockedBy: blocker })
        .expect(200);

      // Advance blocked through the lifecycle to IN_REVIEW
      await request(app.getHttpServer())
        .patch(`/tickets/${blocked}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/tickets/${blocked}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'IN_REVIEW' })
        .expect(200);

      // Attempt to transition to DONE — blocker is still TODO → must fail
      await request(app.getHttpServer())
        .patch(`/tickets/${blocked}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'DONE' })
        .expect(400);
    });

    it('allows DONE when the blocker has itself been resolved to DONE', async () => {
      const blocker = await createTicket('blocker-will-be-done');
      const blocked = await createTicket('blocked-waits-for-done-blocker');

      await request(app.getHttpServer())
        .post(`/tickets/${blocked}/dependencies`)
        .set('Authorization', `Bearer ${token}`)
        .send({ blockedBy: blocker })
        .expect(200);

      // Resolve the blocker to DONE first
      for (const status of ['IN_PROGRESS', 'IN_REVIEW', 'DONE']) {
        await request(app.getHttpServer())
          .patch(`/tickets/${blocker}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ status })
          .expect(200);
      }

      // Now advance blocked to IN_REVIEW
      await request(app.getHttpServer())
        .patch(`/tickets/${blocked}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/tickets/${blocked}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'IN_REVIEW' })
        .expect(200);

      // Blocker is DONE → transition to DONE must succeed
      await request(app.getHttpServer())
        .patch(`/tickets/${blocked}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'DONE' })
        .expect(200);
    });
  });
});
