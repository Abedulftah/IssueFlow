import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { UserRole } from '../src/users/user.entity';
import {
  bootstrapTestApp,
  closeTestApp,
  TestAppContext,
} from './support/test-app.bootstrap';
import { resetDatabase } from './support/db-reset.helper';

describe('Auth API (e2e)', () => {
  let ctx: TestAppContext;
  let app: INestApplication;
  let adminToken: string;
  let adminUserId: number;

  beforeAll(async () => {
    ctx = await bootstrapTestApp();
    app = ctx.app;
    await resetDatabase(ctx.dataSource);

    // Create a user to test login
    const res = await request(app.getHttpServer())
      .post('/users')
      .send({
        username: 'auth_admin',
        email: 'auth_admin@test.com',
        fullName: 'Auth Admin',
        role: UserRole.ADMIN,
      })
      .expect(200);

    adminUserId = res.body.id;
  });

  afterAll(async () => {
    await resetDatabase(ctx.dataSource);
    await closeTestApp(ctx);
  });

  // ── POST /auth/login ──────────────────────────────────────────────────────

  describe('POST /auth/login', () => {
    it('returns 401 when username does not exist', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'nobody', password: 'secret' })
        .expect(401);
    });

    it('returns 401 when password is wrong', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'auth_admin', password: 'wrong_password' })
        .expect(401);
    });

    it('returns accessToken, tokenType, expiresIn on valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'auth_admin', password: 'secret' })
        .expect(200);

      expect(res.body).toMatchObject({
        accessToken: expect.any(String),
        tokenType: 'Bearer',
        expiresIn: 3600,
      });
      adminToken = res.body.accessToken;
    });

    it('returns 400 when body fields are missing', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'auth_admin' })
        .expect(400);
    });
  });

  // ── GET /auth/me ──────────────────────────────────────────────────────────

  describe('GET /auth/me', () => {
    it('returns 401 without token', () => {
      return request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('returns 401 with a malformed token', () => {
      return request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer not-a-valid-jwt')
        .expect(401);
    });

    it('returns the current user object when authenticated', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id: adminUserId,
        username: 'auth_admin',
        email: 'auth_admin@test.com',
        fullName: 'Auth Admin',
        role: UserRole.ADMIN,
      });
    });

    it('does not expose passwordHash in the response', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.passwordHash).toBeUndefined();
    });
  });

  // ── POST /auth/logout ─────────────────────────────────────────────────────

  describe('POST /auth/logout', () => {
    it('returns 401 without token', () => {
      return request(app.getHttpServer()).post('/auth/logout').expect(401);
    });

    it('invalidates the token so subsequent requests return 401', async () => {
      // Obtain a fresh token for this test
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'auth_admin', password: 'secret' })
        .expect(200);

      const freshToken: string = loginRes.body.accessToken;

      // Token works before logout
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${freshToken}`)
        .expect(200);

      // Logout
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${freshToken}`)
        .expect(200);

      // Token is now revoked
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${freshToken}`)
        .expect(401);
    });
  });

  // ── Deleted user token regression ────────────────────────────────────────

  describe('deleted user token regression', () => {
    it('rejects a deleted user token on other protected routes', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/users')
        .send({
          username: 'auth_deleted_user',
          email: 'auth_deleted_user@test.com',
          fullName: 'Auth Deleted User',
          role: UserRole.DEVELOPER,
        })
        .expect(200);

      const deletedUserId = createRes.body.id;

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'auth_deleted_user', password: 'secret' })
        .expect(200);

      const deletedUserToken = loginRes.body.accessToken;

      await request(app.getHttpServer())
        .delete(`/users/${deletedUserId}`)
        .set('Authorization', `Bearer ${deletedUserToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${deletedUserToken}`)
        .expect(401);
    });

    it('rejects an old token after the user is recreated', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/users')
        .send({
          username: 'auth_recreated_user',
          email: 'auth_recreated_user@test.com',
          fullName: 'Auth Recreated User',
          role: UserRole.DEVELOPER,
        })
        .expect(200);

      const userId = createRes.body.id;

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'auth_recreated_user', password: 'secret' })
        .expect(200);

      const oldToken = loginRes.body.accessToken;

      await request(app.getHttpServer())
        .delete(`/users/${userId}`)
        .set('Authorization', `Bearer ${oldToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/users')
        .send({
          username: 'auth_recreated_user',
          email: 'auth_recreated_user@test.com',
          fullName: 'Auth Recreated User Again',
          role: UserRole.DEVELOPER,
        })
        .expect(200);

      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${oldToken}`)
        .expect(401);
    });
  });
});
