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

describe('Users API (e2e)', () => {
  let ctx: TestAppContext;
  let app: INestApplication;
  let adminToken: string;
  let adminUserId: number;
  let devBaseToken: string;

  beforeAll(async () => {
    ctx = await bootstrapTestApp();
    app = ctx.app;
    await resetDatabase(ctx.dataSource);

    // Log in as the default seeded admin (admin/admin)
    const defaultAdminToken = await getDefaultAdminToken(app);

    // Create test admin user
    const createRes = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${defaultAdminToken}`)
      .send({ username: 'u_admin', email: 'u_admin@test.com', fullName: 'U Admin', role: UserRole.ADMIN, password: 'secret' })
      .expect(200);
    adminUserId = createRes.body.id;

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'u_admin', password: 'secret' })
      .expect(200);
    adminToken = loginRes.body.accessToken;

    // Create a base dev user for 403 tests
    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ username: 'u_dev_base', email: 'u_dev_base@test.com', fullName: 'U Dev Base', role: UserRole.DEVELOPER, password: 'secret' })
      .expect(200);

    const devLoginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'u_dev_base', password: 'secret' })
      .expect(200);
    devBaseToken = devLoginRes.body.accessToken;
  });

  afterAll(async () => {
    await resetDatabase(ctx.dataSource);
    await closeTestApp(ctx);
  });

  // ── POST /users ───────────────────────────────────────────────────────────

  describe('POST /users (admin-only)', () => {
    it('creates a DEVELOPER user and returns the expected shape', async () => {
      const res = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: 'jdoe',
          email: 'jdoe@example.com',
          fullName: 'John Doe',
          role: UserRole.DEVELOPER,
          password: 'secret',
        })
        .expect(200);

      expect(res.body).toMatchObject({
        id: expect.any(Number),
        username: 'jdoe',
        email: 'jdoe@example.com',
        fullName: 'John Doe',
        role: UserRole.DEVELOPER,
      });
      // Sensitive fields must be excluded
      expect(res.body.passwordHash).toBeUndefined();
      expect(res.body.createdAt).toBeUndefined();
      expect(res.body.updatedAt).toBeUndefined();
    });

    it('returns 409 when username is already taken', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ username: 'jdoe', email: 'jdoe2@example.com', fullName: 'Jane', role: UserRole.DEVELOPER, password: 'secret' })
        .expect(409);
    });

    it('returns 409 when email is already taken', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ username: 'jdoe3', email: 'jdoe@example.com', fullName: 'Jim', role: UserRole.DEVELOPER, password: 'secret' })
        .expect(409);
    });

    it('returns 400 when required fields are missing', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ username: 'incomplete' })
        .expect(400);
    });

    it('returns 401 when no token is provided', () => {
      return request(app.getHttpServer())
        .post('/users')
        .send({ username: 'noauth_user', email: 'noauth@test.com', fullName: 'No Auth', role: UserRole.DEVELOPER, password: 'secret' })
        .expect(401);
    });

    it('returns 403 when a non-admin token is used', () => {
      return request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${devBaseToken}`)
        .send({ username: 'dev_creates_user', email: 'dev_creates@test.com', fullName: 'Dev Creates', role: UserRole.DEVELOPER, password: 'secret' })
        .expect(403);
    });

    it('returns 400 when email is malformed', () => {
      return request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ username: 'bademail_user', email: 'not-an-email', fullName: 'Bad Email', role: UserRole.DEVELOPER })
        .expect(400);
    });

    it('returns 400 when role is not a valid enum value', () => {
      return request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ username: 'badrole_user', email: 'badrole@test.com', fullName: 'Bad Role', role: 'OWNER' })
        .expect(400);
    });
  });

  // ── GET /users ────────────────────────────────────────────────────────────

  describe('GET /users', () => {
    it('returns 401 without token', () => {
      return request(app.getHttpServer()).get('/users').expect(401);
    });

    it('returns an array of users', async () => {
      const res = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);

      const user = res.body[0];
      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('username');
      expect(user).toHaveProperty('email');
      expect(user).toHaveProperty('fullName');
      expect(user).toHaveProperty('role');
      expect(user.passwordHash).toBeUndefined();
    });
  });

  // ── GET /users/:userId ────────────────────────────────────────────────────

  describe('GET /users/:userId', () => {
    it('returns 401 without token', () => {
      return request(app.getHttpServer()).get(`/users/${adminUserId}`).expect(401);
    });

    it('returns the user with correct shape', async () => {
      const res = await request(app.getHttpServer())
        .get(`/users/${adminUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id: adminUserId,
        username: 'u_admin',
        email: 'u_admin@test.com',
        fullName: 'U Admin',
        role: UserRole.ADMIN,
      });
      expect(res.body.passwordHash).toBeUndefined();
    });

    it('returns 404 for a non-existent user', async () => {
      return request(app.getHttpServer())
        .get('/users/999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  // ── POST /users/update/:userId ────────────────────────────────────────────

  describe('POST /users/update/:userId', () => {
    let devToken: string;
    let devUserId: number;

    beforeAll(async () => {
      const createRes = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ username: 'u_dev', email: 'u_dev@test.com', fullName: 'U Dev', role: UserRole.DEVELOPER, password: 'secret' })
        .expect(200);
      devUserId = createRes.body.id;

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'u_dev', password: 'secret' })
        .expect(200);
      devToken = loginRes.body.accessToken;
    });

    it('returns 401 without token', () => {
      return request(app.getHttpServer())
        .post(`/users/update/${adminUserId}`)
        .send({ fullName: 'New Name' })
        .expect(401);
    });

    it('admin can update fullName and role', async () => {
      await request(app.getHttpServer())
        .post(`/users/update/${adminUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fullName: 'Updated Admin', role: UserRole.ADMIN })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/users/${adminUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.fullName).toBe('Updated Admin');
    });

    it('non-admin can update fullName without role', async () => {
      await request(app.getHttpServer())
        .post(`/users/update/${devUserId}`)
        .set('Authorization', `Bearer ${devToken}`)
        .send({ fullName: 'Dev Updated' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/users/${devUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.fullName).toBe('Dev Updated');
    });

    it('non-admin cannot promote a user — returns 403', () => {
      return request(app.getHttpServer())
        .post(`/users/update/${devUserId}`)
        .set('Authorization', `Bearer ${devToken}`)
        .send({ role: UserRole.ADMIN })
        .expect(403);
    });

    it('returns 404 when user does not exist', async () => {
      return request(app.getHttpServer())
        .post('/users/update/999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fullName: 'Ghost' })
        .expect(404);
    });
  });

  // ── DELETE /users/:userId ─────────────────────────────────────────────────

  describe('DELETE /users/:userId', () => {
    it('returns 401 without token', () => {
      return request(app.getHttpServer()).delete(`/users/${adminUserId}`).expect(401);
    });

    it('deletes a user and returns 200', async () => {
      // Create a user to delete
      const createRes = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ username: 'to_delete', email: 'to_delete@test.com', fullName: 'To Delete', role: UserRole.DEVELOPER, password: 'secret' })
        .expect(200);

      const userId = createRes.body.id;

      await request(app.getHttpServer())
        .delete(`/users/${userId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Verify it's gone
      await request(app.getHttpServer())
        .get(`/users/${userId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('invalidates the deleted user token immediately', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: 'self_delete',
          email: 'self_delete@test.com',
          fullName: 'Self Delete',
          role: UserRole.DEVELOPER,
          password: 'secret',
        })
        .expect(200);

      const userId = createRes.body.id;

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'self_delete', password: 'secret' })
        .expect(200);

      const userToken = loginRes.body.accessToken;

      await request(app.getHttpServer())
        .delete(`/users/${userId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(401);
    });

    it('returns 404 when user does not exist', async () => {
      return request(app.getHttpServer())
        .delete('/users/999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  // ── GET /users/:userId/mentions ───────────────────────────────────────────

  describe('GET /users/:userId/mentions', () => {
    it('returns paginated mentions with { data, total, page } shape', async () => {
      const res = await request(app.getHttpServer())
        .get(`/users/${adminUserId}/mentions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toMatchObject({
        data: expect.any(Array),
        total: expect.any(Number),
        page: expect.any(Number),
      });
    });

    it('respects page and pageSize query params', async () => {
      const res = await request(app.getHttpServer())
        .get(`/users/${adminUserId}/mentions?page=1&pageSize=5`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.page).toBe(1);
      expect(res.body.data.length).toBeLessThanOrEqual(5);
    });

    it('returns 401 without token', () => {
      return request(app.getHttpServer())
        .get(`/users/${adminUserId}/mentions`)
        .expect(401);
    });

    it('returns the comment when the user has been @mentioned', async () => {
      // Create a second user that will be mentioned
      const mentionedRes = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: 'mentioned_user',
          email: 'mentioned_user@test.com',
          fullName: 'Mentioned User',
          role: UserRole.DEVELOPER,
          password: 'secret',
        })
        .expect(200);
      const mentionedId: number = mentionedRes.body.id;

      // Create a project and ticket so we can post a comment
      const projRes = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Mention Test Project', description: 'e2e', ownerId: adminUserId })
        .expect(200);

      const tktRes = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Mention test ticket',
          priority: TicketPriority.LOW,
          type: TicketType.TECHNICAL,
          projectId: projRes.body.id,
          assigneeId: mentionedId,
        })
        .expect(200);

      // Post a comment mentioning the user
      const commentRes = await request(app.getHttpServer())
        .post(`/tickets/${tktRes.body.id}/comments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ authorId: adminUserId, content: 'Hey @mentioned_user, can you take a look?' })
        .expect(200);

      // Verify the mention appears in GET /users/:id/mentions
      const mentionsRes = await request(app.getHttpServer())
        .get(`/users/${mentionedId}/mentions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(mentionsRes.body.total).toBeGreaterThanOrEqual(1);
      const found = mentionsRes.body.data.find((c: any) => c.id === commentRes.body.id);
      expect(found).toBeDefined();
      expect(found.content).toContain('@mentioned_user');
      expect(found.mentionedUsers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: mentionedId, username: 'mentioned_user' }),
        ]),
      );
    });

    it('returns 404 when userId does not exist', () => {
      return request(app.getHttpServer())
        .get('/users/999999/mentions')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });
});
