import request from 'supertest';
import { UserRole } from '../../src/users/user.entity';
import {
  bootstrapTestApp,
  closeTestApp,
  TestAppContext,
} from '../support/test-app.bootstrap';
import { resetDatabase } from '../support/db-reset.helper';
import { seedAndLogin, AuthSession } from '../support/auth.helper';
import { makeUserPayload } from '../support/factories/user.factory';

describe('Users CRUD journey (e2e)', () => {
  let ctx: TestAppContext;
  let admin: AuthSession;

  beforeAll(async () => {
    ctx = await bootstrapTestApp();
  });

  afterAll(async () => {
    await resetDatabase(ctx.dataSource);
    await closeTestApp(ctx);
  });

  beforeEach(async () => {
    await resetDatabase(ctx.dataSource);
    admin = await seedAndLogin(ctx.app, { role: UserRole.ADMIN });
  });

  it('POST /users creates a user matching the README payload shape', async () => {
    const payload = makeUserPayload({
      username: 'jdoe',
      email: 'jdoe@example.com',
      fullName: 'John Doe',
      role: UserRole.DEVELOPER,
    });

    const res = await request(ctx.app.getHttpServer())
      .post('/users')
      .send(payload)
      .expect(200);

    expect(res.body).toMatchObject({
      id: expect.any(Number),
      username: 'jdoe',
      email: 'jdoe@example.com',
      fullName: 'John Doe',
      role: 'DEVELOPER',
    });
    expect(res.body.passwordHash).toBeUndefined();
  });

  it('GET /users returns the seeded admin plus a freshly created user', async () => {
    const payload = makeUserPayload({ username: 'jdoe' });
    await request(ctx.app.getHttpServer())
      .post('/users')
      .send(payload)
      .expect(200);

    const res = await request(ctx.app.getHttpServer())
      .get('/users')
      .set(admin.authHeader)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    const usernames = res.body.map((u: { username: string }) => u.username);
    expect(usernames).toEqual(expect.arrayContaining([admin.username, 'jdoe']));
  });

  it('GET /users/:userId returns the README-shaped user object', async () => {
    const payload = makeUserPayload({
      username: 'jdoe',
      email: 'jdoe@example.com',
      fullName: 'John Doe',
    });
    const created = await request(ctx.app.getHttpServer())
      .post('/users')
      .send(payload)
      .expect(200);

    const res = await request(ctx.app.getHttpServer())
      .get(`/users/${created.body.id}`)
      .set(admin.authHeader)
      .expect(200);

    expect(res.body).toEqual(
      expect.objectContaining({
        id: created.body.id,
        username: 'jdoe',
        email: 'jdoe@example.com',
        fullName: 'John Doe',
        role: 'DEVELOPER',
      }),
    );
    expect(res.body.passwordHash).toBeUndefined();
  });

  it('GET /users/:userId returns 404 for an unknown id', () => {
    return request(ctx.app.getHttpServer())
      .get('/users/999999')
      .set(admin.authHeader)
      .expect(404);
  });

  it('POST /users/update/:userId updates fullName and role per README', async () => {
    const created = await request(ctx.app.getHttpServer())
      .post('/users')
      .send(makeUserPayload({ username: 'jdoe', role: UserRole.DEVELOPER }))
      .expect(200);

    // README documents POST (not PATCH) for user update
    await request(ctx.app.getHttpServer())
      .post(`/users/update/${created.body.id}`)
      .set(admin.authHeader)
      .send({ fullName: 'Jane Doe', role: UserRole.ADMIN })
      .expect(200);

    const reread = await request(ctx.app.getHttpServer())
      .get(`/users/${created.body.id}`)
      .set(admin.authHeader)
      .expect(200);

    expect(reread.body.fullName).toBe('Jane Doe');
    expect(reread.body.role).toBe('ADMIN');
  });

  it('DELETE /users/:userId removes the user', async () => {
    const created = await request(ctx.app.getHttpServer())
      .post('/users')
      .send(makeUserPayload({ username: 'jdoe' }))
      .expect(200);

    await request(ctx.app.getHttpServer())
      .delete(`/users/${created.body.id}`)
      .set(admin.authHeader)
      .expect(200);

    await request(ctx.app.getHttpServer())
      .get(`/users/${created.body.id}`)
      .set(admin.authHeader)
      .expect(404);
  });

  // ── class-validator (ValidationPipe) 400 cases ──────────────────────────

  it('POST /users returns 400 when email is malformed', () => {
    return request(ctx.app.getHttpServer())
      .post('/users')
      .send({
        username: 'jdoe',
        email: 'not-an-email',
        fullName: 'John Doe',
        role: UserRole.DEVELOPER,
      })
      .expect(400);
  });

  it('POST /users returns 400 when role is not in the enum', () => {
    return request(ctx.app.getHttpServer())
      .post('/users')
      .send({
        username: 'jdoe',
        email: 'jdoe@example.com',
        fullName: 'John Doe',
        role: 'OWNER',
      })
      .expect(400);
  });

  it('POST /users returns 400 when required fields are missing', () => {
    return request(ctx.app.getHttpServer())
      .post('/users')
      .send({ username: 'jdoe' })
      .expect(400);
  });

  // ── End-to-end happy path: Create → Read → Update → Delete ──────────────

  it('runs the full Create → Read → Update → Delete journey for a single user', async () => {
    const payload = makeUserPayload({
      username: 'lifecycle_user',
      email: 'lifecycle@example.com',
      fullName: 'Lifecycle User',
      role: UserRole.DEVELOPER,
    });

    // Create
    const create = await request(ctx.app.getHttpServer())
      .post('/users')
      .send(payload)
      .expect(200);
    const userId = create.body.id;
    expect(userId).toEqual(expect.any(Number));

    // Read
    const read = await request(ctx.app.getHttpServer())
      .get(`/users/${userId}`)
      .set(admin.authHeader)
      .expect(200);
    expect(read.body).toMatchObject({
      id: userId,
      username: 'lifecycle_user',
      role: 'DEVELOPER',
    });

    // Update
    await request(ctx.app.getHttpServer())
      .post(`/users/update/${userId}`)
      .set(admin.authHeader)
      .send({ fullName: 'Lifecycle Updated', role: UserRole.ADMIN })
      .expect(200);

    const afterUpdate = await request(ctx.app.getHttpServer())
      .get(`/users/${userId}`)
      .set(admin.authHeader)
      .expect(200);
    expect(afterUpdate.body.fullName).toBe('Lifecycle Updated');
    expect(afterUpdate.body.role).toBe('ADMIN');

    // Delete
    await request(ctx.app.getHttpServer())
      .delete(`/users/${userId}`)
      .set(admin.authHeader)
      .expect(200);

    await request(ctx.app.getHttpServer())
      .get(`/users/${userId}`)
      .set(admin.authHeader)
      .expect(404);
  });
});
