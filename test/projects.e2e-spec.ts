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
import { getDefaultAdminToken } from './support/auth.helper';

describe('Projects API (e2e)', () => {
  let ctx: TestAppContext;
  let app: INestApplication;
  let adminToken: string;
  let adminUserId: number;
  let projectId: number;

  beforeAll(async () => {
    ctx = await bootstrapTestApp();
    app = ctx.app;
    await resetDatabase(ctx.dataSource);

    const defaultAdminToken = await getDefaultAdminToken(app);

    const userRes = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${defaultAdminToken}`)
      .send({ username: 'proj_admin', email: 'proj_admin@test.com', fullName: 'Proj Admin', role: UserRole.ADMIN, password: 'secret' })
      .expect(200);
    adminUserId = userRes.body.id;

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'proj_admin', password: 'secret' })
      .expect(200);
    adminToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    await resetDatabase(ctx.dataSource);
    await closeTestApp(ctx);
  });

  // ── POST /projects ────────────────────────────────────────────────────────

  describe('POST /projects', () => {
    it('returns 401 without token', () => {
      return request(app.getHttpServer())
        .post('/projects')
        .send({ name: 'Unauthorized', description: 'x', ownerId: 1 })
        .expect(401);
    });

    it('creates a project and returns correct shape', async () => {
      const res = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Sample Project', description: 'A sample project', ownerId: adminUserId })
        .expect(200);

      expect(res.body).toMatchObject({
        id: expect.any(Number),
        name: 'Sample Project',
        description: 'A sample project',
        ownerId: adminUserId,
      });
      // Hidden fields must not be exposed
      expect(res.body.updatedAt).toBeUndefined();
      projectId = res.body.id;
    });

    it('returns 404 when ownerId references non-existent user', async () => {
      return request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Ghost Project', description: 'x', ownerId: 999999 })
        .expect(404);
    });

    it('returns 400 when required fields are missing', async () => {
      return request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ description: 'No name' })
        .expect(400);
    });
  });

  // ── GET /projects ─────────────────────────────────────────────────────────

  describe('GET /projects', () => {
    it('returns 401 without token', () => {
      return request(app.getHttpServer()).get('/projects').expect(401);
    });

    it('returns an array of projects with correct shape', async () => {
      const res = await request(app.getHttpServer())
        .get('/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const proj = res.body.find((p: any) => p.id === projectId);
      expect(proj).toBeDefined();
      expect(proj).toMatchObject({ id: projectId, name: 'Sample Project', ownerId: adminUserId });
    });
  });

  // ── GET /projects/:projectId ──────────────────────────────────────────────

  describe('GET /projects/:projectId', () => {
    it('returns 401 without token', () => {
      return request(app.getHttpServer()).get(`/projects/${projectId}`).expect(401);
    });

    it('returns the project with correct shape', async () => {
      const res = await request(app.getHttpServer())
        .get(`/projects/${projectId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id: projectId,
        name: 'Sample Project',
        description: 'A sample project',
        ownerId: adminUserId,
      });
    });

    it('returns 404 for non-existent project', async () => {
      return request(app.getHttpServer())
        .get('/projects/999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  // ── PATCH /projects/:projectId ────────────────────────────────────────────

  describe('PATCH /projects/:projectId', () => {
    it('returns 401 without token', () => {
      return request(app.getHttpServer())
        .patch(`/projects/${projectId}`)
        .send({ name: 'Updated' })
        .expect(401);
    });

    it('updates name and description', async () => {
      await request(app.getHttpServer())
        .patch(`/projects/${projectId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated Name', description: 'Updated description' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/projects/${projectId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.name).toBe('Updated Name');
      expect(res.body.description).toBe('Updated description');
    });

    it('returns 404 for non-existent project', async () => {
      return request(app.getHttpServer())
        .patch('/projects/999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Ghost' })
        .expect(404);
    });
  });

  // ── DELETE /projects/:projectId (soft-delete) ─────────────────────────────

  describe('DELETE /projects/:projectId', () => {
    it('returns 401 without token', () => {
      return request(app.getHttpServer())
        .delete(`/projects/${projectId}`)
        .expect(401);
    });

    it('soft-deletes the project – it disappears from GET /projects', async () => {
      // Create a separate project for deletion
      const projRes = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'To Soft Delete', description: 'x', ownerId: adminUserId })
        .expect(200);
      const delId = projRes.body.id;

      await request(app.getHttpServer())
        .delete(`/projects/${delId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Should NOT appear in standard listing
      const listRes = await request(app.getHttpServer())
        .get('/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(listRes.body.find((p: any) => p.id === delId)).toBeUndefined();
    });

    it('returns 404 for non-existent project', async () => {
      return request(app.getHttpServer())
        .delete('/projects/999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  // ── GET /projects/deleted (ADMIN-only soft-delete list) ───────────────────

  describe('GET /projects/deleted', () => {
    it('returns 401 without token', () => {
      return request(app.getHttpServer()).get('/projects/deleted').expect(401);
    });

    it('returns an array of soft-deleted projects', async () => {
      const res = await request(app.getHttpServer())
        .get('/projects/deleted')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('includes the deleted project and excludes active ones', async () => {
      const projRes = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Will Be Deleted', description: 'x', ownerId: adminUserId })
        .expect(200);
      const deletedId = projRes.body.id;

      await request(app.getHttpServer())
        .delete(`/projects/${deletedId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/projects/deleted')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.find((p: any) => p.id === deletedId)).toBeDefined();
      // Active projectId should not appear in deleted list
      expect(res.body.find((p: any) => p.id === projectId)).toBeUndefined();
    });
  });

  // ── POST /projects/:projectId/restore (ADMIN-only) ────────────────────────

  describe('POST /projects/:projectId/restore', () => {
    it('returns 401 without token', async () => {
      const projRes = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Restore Auth Test', description: 'x', ownerId: adminUserId })
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/projects/${projRes.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      return request(app.getHttpServer())
        .post(`/projects/${projRes.body.id}/restore`)
        .expect(401);
    });

    it('restores a soft-deleted project', async () => {
      const projRes = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Restore Me', description: 'x', ownerId: adminUserId })
        .expect(200);
      const restoreId = projRes.body.id;

      await request(app.getHttpServer())
        .delete(`/projects/${restoreId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/projects/${restoreId}/restore`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const listRes = await request(app.getHttpServer())
        .get('/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(listRes.body.find((p: any) => p.id === restoreId)).toBeDefined();
    });

    it('returns 404 when project does not exist', () => {
      return request(app.getHttpServer())
        .post('/projects/999999/restore')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('returns 400 when project is not deleted', async () => {
      return request(app.getHttpServer())
        .post(`/projects/${projectId}/restore`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });
  });

  // ── Soft-delete isolation ─────────────────────────────────────────────────

  describe('Soft-deleted project isolation', () => {
    let deletedProjectId: number;

    beforeAll(async () => {
      const projRes = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Isolation Project', description: 'x', ownerId: adminUserId })
        .expect(200);
      deletedProjectId = projRes.body.id;

      await request(app.getHttpServer())
        .delete(`/projects/${deletedProjectId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('returns 404 when creating a ticket for a soft-deleted project', async () => {
      return request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Ghost ticket', priority: TicketPriority.LOW, type: TicketType.TECHNICAL, projectId: deletedProjectId })
        .expect(404);
    });

    it('returns 404 when retrieving a single ticket that belongs to a soft-deleted project', async () => {
      // Insert a ticket directly via a project that is then deleted
      // We need a separate project to create the ticket first, then delete the project
      const activeProjRes = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Active Then Delete', description: 'x', ownerId: adminUserId })
        .expect(200);
      const activeProjId = activeProjRes.body.id;

      const tktRes = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Orphaned ticket', priority: TicketPriority.LOW, type: TicketType.TECHNICAL, projectId: activeProjId })
        .expect(200);
      const tktId = tktRes.body.id;

      // Now soft-delete the project
      await request(app.getHttpServer())
        .delete(`/projects/${activeProjId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // GET /tickets/:id should return 404 because assertProjectActive is called
      return request(app.getHttpServer())
        .get(`/tickets/${tktId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  // ── GET /projects/:projectId/workload ─────────────────────────────────────
  // Requires workload endpoint to be implemented.

  describe('GET /projects/:projectId/workload', () => {
    it('returns 401 without token', () => {
      return request(app.getHttpServer())
        .get(`/projects/${projectId}/workload`)
        .expect(401);
    });

    it('returns an array of { userId, username, openTicketCount } sorted ascending', async () => {
      const res = await request(app.getHttpServer())
        .get(`/projects/${projectId}/workload`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      if (res.body.length >= 2) {
        // Verify ascending sort by openTicketCount
        for (let i = 1; i < res.body.length; i++) {
          expect(res.body[i].openTicketCount).toBeGreaterThanOrEqual(res.body[i - 1].openTicketCount);
        }
      }
      if (res.body.length > 0) {
        expect(res.body[0]).toMatchObject({
          userId: expect.any(Number),
          username: expect.any(String),
          openTicketCount: expect.any(Number),
        });
      }
    });
  });
});
