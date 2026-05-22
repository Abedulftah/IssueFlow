import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { UserRole } from '../src/users/user.entity';
import {
  bootstrapTestApp,
  closeTestApp,
  TestAppContext,
} from './support/test-app.bootstrap';
import { resetDatabase } from './support/db-reset.helper';

describe('Users API (e2e)', () => {
  let ctx: TestAppContext;
  let app: INestApplication;
  let adminToken: string;
  let adminUserId: number;

  beforeAll(async () => {
    ctx = await bootstrapTestApp();
    app = ctx.app;
    await resetDatabase(ctx.dataSource);

    // Create admin user and login
    const createRes = await request(app.getHttpServer())
      .post('/users')
      .send({ username: 'u_admin', email: 'u_admin@test.com', fullName: 'U Admin', role: UserRole.ADMIN })
      .expect(200);

    adminUserId = createRes.body.id;

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'u_admin', password: 'secret' })
      .expect(200);

    adminToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    await resetDatabase(ctx.dataSource);
    await closeTestApp(ctx);
  });

  // ── POST /users ───────────────────────────────────────────────────────────

  describe('POST /users (public – no auth required)', () => {
    it('creates a DEVELOPER user and returns the expected shape', async () => {
      const res = await request(app.getHttpServer())
        .post('/users')
        .send({
          username: 'jdoe',
          email: 'jdoe@example.com',
          fullName: 'John Doe',
          role: UserRole.DEVELOPER,
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
        .send({ username: 'jdoe', email: 'jdoe2@example.com', fullName: 'Jane', role: UserRole.DEVELOPER })
        .expect(409);
    });

    it('returns 409 when email is already taken', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .send({ username: 'jdoe3', email: 'jdoe@example.com', fullName: 'Jim', role: UserRole.DEVELOPER })
        .expect(409);
    });

    it('returns 400 when required fields are missing', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .send({ username: 'incomplete' })
        .expect(400);
    });

    it('does not require auth – accepts request without Authorization header', () => {
      return request(app.getHttpServer())
        .post('/users')
        .send({ username: 'noauth_user', email: 'noauth@test.com', fullName: 'No Auth', role: UserRole.DEVELOPER })
        .expect(200);
    });

    it('returns 400 when email is malformed', () => {
      return request(app.getHttpServer())
        .post('/users')
        .send({ username: 'bademail_user', email: 'not-an-email', fullName: 'Bad Email', role: UserRole.DEVELOPER })
        .expect(400);
    });

    it('returns 400 when role is not a valid enum value', () => {
      return request(app.getHttpServer())
        .post('/users')
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
    it('returns 401 without token', () => {
      return request(app.getHttpServer())
        .post(`/users/update/${adminUserId}`)
        .send({ fullName: 'New Name' })
        .expect(401);
    });

    it('updates fullName and role', async () => {
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
        .send({ username: 'to_delete', email: 'to_delete@test.com', fullName: 'To Delete', role: UserRole.DEVELOPER })
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

    it('returns 404 when user does not exist', async () => {
      return request(app.getHttpServer())
        .delete('/users/999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  // ── GET /users/:userId/mentions ───────────────────────────────────────────
  // NOTE: This feature requires @mention parsing to be implemented in CommentsService
  // and the GET /users/:userId/mentions route to be added to UsersController.

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
  });
});
