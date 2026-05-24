import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { UserRole } from '../src/users/user.entity';
import { TicketPriority, TicketType } from '../src/tickets/enums';
import {
  bootstrapTestApp,
  closeTestApp,
  TestAppContext,
} from './support/test-app.bootstrap';
import { resetDatabase } from './support/db-reset.helper';
import { seedAndLogin } from './support/auth.helper';

describe('ADMIN-only role enforcement (e2e)', () => {
  let ctx: TestAppContext;
  let app: INestApplication;
  let devToken: string;
  let adminToken: string;
  let projectId: number;
  let ticketId: number;

  beforeAll(async () => {
    ctx = await bootstrapTestApp();
    app = ctx.app;
    await resetDatabase(ctx.dataSource);

    // Seed an ADMIN user and log in
    const admin = await seedAndLogin(app, { role: UserRole.ADMIN });
    adminToken = admin.token;

    // Seed a DEVELOPER user and log in
    const dev = await seedAndLogin(app, { role: UserRole.DEVELOPER });
    devToken = dev.token;

    // Create a project owned by admin
    const projRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Role Test Project', description: 'e2e', ownerId: admin.id })
      .expect(200);
    projectId = projRes.body.id;

    // Create and soft-delete a ticket so there is something in the deleted list
    const tktRes = await request(app.getHttpServer())
      .post('/tickets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Role guard ticket',
        priority: TicketPriority.LOW,
        type: TicketType.TECHNICAL,
        projectId,
      })
      .expect(200);
    ticketId = tktRes.body.id;

    await request(app.getHttpServer())
      .delete(`/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  afterAll(async () => {
    await resetDatabase(ctx.dataSource);
    await closeTestApp(ctx);
  });

  // ── GET /tickets/deleted ──────────────────────────────────────────────────

  describe('GET /tickets/deleted', () => {
    it('returns 200 for ADMIN token', async () => {
      await request(app.getHttpServer())
        .get(`/tickets/deleted?projectId=${projectId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('returns 403 for DEVELOPER token', async () => {
      await request(app.getHttpServer())
        .get(`/tickets/deleted?projectId=${projectId}`)
        .set('Authorization', `Bearer ${devToken}`)
        .expect(403);
    });
  });

  // ── POST /tickets/:id/restore ─────────────────────────────────────────────

  describe('POST /tickets/:id/restore', () => {
    it('returns 200 for ADMIN token', async () => {
      await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/restore`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Re-delete so later tests have a deleted ticket to work with
      await request(app.getHttpServer())
        .delete(`/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('returns 403 for DEVELOPER token', async () => {
      await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/restore`)
        .set('Authorization', `Bearer ${devToken}`)
        .expect(403);
    });
  });

  // ── GET /projects/deleted ─────────────────────────────────────────────────

  describe('GET /projects/deleted', () => {
    let deletedProjectId: number;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'To Delete For Role Test', description: 'x', ownerId: 1 })
        .expect(200);
      deletedProjectId = res.body.id;

      await request(app.getHttpServer())
        .delete(`/projects/${deletedProjectId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('returns 200 for ADMIN token', async () => {
      await request(app.getHttpServer())
        .get('/projects/deleted')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('returns 403 for DEVELOPER token', async () => {
      await request(app.getHttpServer())
        .get('/projects/deleted')
        .set('Authorization', `Bearer ${devToken}`)
        .expect(403);
    });
  });

  // ── POST /projects/:id/restore ────────────────────────────────────────────

  describe('POST /projects/:id/restore', () => {
    let deletedProjectId: number;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Restore Role Test Project', description: 'x', ownerId: 1 })
        .expect(200);
      deletedProjectId = res.body.id;

      await request(app.getHttpServer())
        .delete(`/projects/${deletedProjectId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('returns 403 for DEVELOPER token', async () => {
      await request(app.getHttpServer())
        .post(`/projects/${deletedProjectId}/restore`)
        .set('Authorization', `Bearer ${devToken}`)
        .expect(403);
    });

    it('returns 200 for ADMIN token', async () => {
      await request(app.getHttpServer())
        .post(`/projects/${deletedProjectId}/restore`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });
});
