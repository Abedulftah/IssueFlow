import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from '../src/users/user.entity';
import { Comment } from '../src/comments/comment.entity';
import { TicketPriority, TicketType } from '../src/tickets/enums';
import {
  bootstrapTestApp,
  closeTestApp,
  TestAppContext,
} from './support/test-app.bootstrap';
import { resetDatabase } from './support/db-reset.helper';
import { getDefaultAdminToken } from './support/auth.helper';

describe('Comments API (e2e)', () => {
  let ctx: TestAppContext;
  let app: INestApplication;
  let adminToken: string;
  let adminUserId: number;
  let authorUserId: number;
  let mentionedUserId: number;
  let ticketId: number;
  let projectId: number;

  beforeAll(async () => {
    ctx = await bootstrapTestApp();
    app = ctx.app;
    await resetDatabase(ctx.dataSource);

    const defaultAdminToken = await getDefaultAdminToken(app);

    const adminRes = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${defaultAdminToken}`)
      .send({ username: 'cmt_admin', email: 'cmt_admin@test.com', fullName: 'Cmt Admin', role: UserRole.ADMIN, password: 'secret' })
      .expect(200);
    adminUserId = adminRes.body.id;

    const authorRes = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${defaultAdminToken}`)
      .send({ username: 'cmt_author', email: 'cmt_author@test.com', fullName: 'Cmt Author', role: UserRole.DEVELOPER, password: 'secret' })
      .expect(200);
    authorUserId = authorRes.body.id;

    const mentionRes = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${defaultAdminToken}`)
      .send({ username: 'jdoe', email: 'jdoe@test.com', fullName: 'John Doe', role: UserRole.DEVELOPER, password: 'secret' })
      .expect(200);
    mentionedUserId = mentionRes.body.id;

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'cmt_admin', password: 'secret' })
      .expect(200);
    adminToken = loginRes.body.accessToken;

    const projRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Comment Test Project', description: 'e2e', ownerId: adminUserId })
      .expect(200);
    projectId = projRes.body.id;

    const tktRes = await request(app.getHttpServer())
      .post('/tickets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Parent ticket', priority: TicketPriority.LOW, type: TicketType.TECHNICAL, projectId, assigneeId: authorUserId })
      .expect(200);
    ticketId = tktRes.body.id;
  });

  afterAll(async () => {
    await resetDatabase(ctx.dataSource);
    await closeTestApp(ctx);
  });

  // ── POST /tickets/:ticketId/comments ──────────────────────────────────────

  describe('POST /tickets/:ticketId/comments', () => {
    it('returns 401 without token', () => {
      return request(app.getHttpServer())
        .post(`/tickets/${ticketId}/comments`)
        .send({ content: 'Hello' })
        .expect(401);
    });

    it('creates a comment and returns correct shape', async () => {
      const res = await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/comments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ content: 'Simple comment' })
        .expect(200);

      expect(res.body).toMatchObject({
        id: expect.any(Number),
        ticketId,
        authorId: adminUserId,
        content: 'Simple comment',
        mentionedUsers: expect.any(Array),
      });
      expect(res.body.version).toBeUndefined();
      expect(res.body.createdAt).toBeUndefined();
    });

    it('parses @mention tokens and returns mentionedUsers', async () => {
      const res = await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/comments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ content: 'Hey @jdoe, please review!' })
        .expect(200);

      expect(res.body.mentionedUsers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: mentionedUserId, username: 'jdoe', fullName: 'John Doe' }),
        ]),
      );
    });

    it('returns 400 when @mention references a non-existent username', async () => {
      await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/comments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ content: 'Hey @ghost_user please help' })
        .expect(400);
    });

    it('matches @mention case-insensitively (@JDOE resolves to user jdoe)', async () => {
      // Requirement: "Mentions are case-insensitive when matching usernames"
      const res = await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/comments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ content: 'Hey @JDOE, please review!' })
        .expect(200);

      expect(res.body.mentionedUsers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: mentionedUserId, username: 'jdoe' }),
        ]),
      );
    });

    it('returns 404 when ticketId does not exist', async () => {
      return request(app.getHttpServer())
        .post('/tickets/999999/comments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ content: 'x' })
        .expect(404);
    });
  });

  // ── GET /tickets/:ticketId/comments ───────────────────────────────────────

  describe('GET /tickets/:ticketId/comments', () => {
    it('returns 401 without token', () => {
      return request(app.getHttpServer())
        .get(`/tickets/${ticketId}/comments`)
        .expect(401);
    });

    it('returns an array of comments with mentionedUsers', async () => {
      const res = await request(app.getHttpServer())
        .get(`/tickets/${ticketId}/comments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      if (res.body.length > 0) {
        const comment = res.body[0];
        expect(comment).toHaveProperty('id');
        expect(comment).toHaveProperty('ticketId');
        expect(comment).toHaveProperty('authorId');
        expect(comment).toHaveProperty('content');
        expect(comment).toHaveProperty('mentionedUsers');
        expect(Array.isArray(comment.mentionedUsers)).toBe(true);
      }
    });

    it('returns 404 when ticketId does not exist', async () => {
      return request(app.getHttpServer())
        .get('/tickets/999999/comments')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  // ── PATCH /tickets/:ticketId/comments/:commentId ──────────────────────────

  describe('PATCH /tickets/:ticketId/comments/:commentId', () => {
    let commentId: number;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/comments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ content: 'Original @jdoe' })
        .expect(200);
      commentId = res.body.id;
    });

    it('returns 401 without token', () => {
      return request(app.getHttpServer())
        .patch(`/tickets/${ticketId}/comments/${commentId}`)
        .send({ content: 'Updated' })
        .expect(401);
    });

    it('updates comment content', async () => {
      await request(app.getHttpServer())
        .patch(`/tickets/${ticketId}/comments/${commentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ content: 'Updated comment without mention' })
        .expect(200);

      // Verify the mention list is diffed (mention removed)
      const listRes = await request(app.getHttpServer())
        .get(`/tickets/${ticketId}/comments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const updated = listRes.body.find((c: any) => c.id === commentId);
      expect(updated?.content).toBe('Updated comment without mention');
    });

    it('diffs @mentions on update - adds new, removes stale', async () => {
      // Create comment with one mention
      const createRes = await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/comments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ content: '@jdoe please check' })
        .expect(200);
      const id = createRes.body.id;

      // Update to remove the mention
      await request(app.getHttpServer())
        .patch(`/tickets/${ticketId}/comments/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ content: 'No more mentions' })
        .expect(200);

      // Verify via GET that mentionedUsers is now empty
      const listRes = await request(app.getHttpServer())
        .get(`/tickets/${ticketId}/comments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const updated = listRes.body.find((c: any) => c.id === id);
      expect(updated?.mentionedUsers?.length ?? 0).toBe(0);
    });

    it('diffs @mentions on update - adds new mentions', async () => {
      // create a second user to mention
      const userRes = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ username: 'asmith', email: 'asmith@test.com', fullName: 'Alice Smith', role: UserRole.DEVELOPER, password: 'secret' })
        .expect(200);
      const asmithId = userRes.body.id;

      // create comment without mentions
      const createRes = await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/comments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ content: 'No mentions initially' })
        .expect(200);
      const id = createRes.body.id;

      // update to add mentions for jdoe and asmith
      await request(app.getHttpServer())
        .patch(`/tickets/${ticketId}/comments/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ content: `Now mentioning @jdoe and @asmith` })
        .expect(200);

      // Verify via GET that both users are now mentioned
      const listRes = await request(app.getHttpServer())
        .get(`/tickets/${ticketId}/comments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const updated = listRes.body.find((c: any) => c.id === id);
      expect(updated.mentionedUsers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: mentionedUserId, username: 'jdoe' }),
          expect.objectContaining({ id: asmithId, username: 'asmith' }),
        ]),
      );
    });

    it('returns 404 for non-existent comment', async () => {
      return request(app.getHttpServer())
        .patch(`/tickets/${ticketId}/comments/999999`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ content: 'x' })
        .expect(404);
    });
  });

  // ── Optimistic locking ────────────────────────────────────────────────────

  describe('Optimistic locking (version mismatch → 409)', () => {
    let commentId: number;
    let commentRepo: Repository<Comment>;

    beforeAll(async () => {
      commentRepo = ctx.moduleRef.get<Repository<Comment>>(getRepositoryToken(Comment));

      const res = await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/comments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ content: 'Lock test comment' })
        .expect(200);
      commentId = res.body.id;
    });

    it('returns 409 when the client sends a stale version', async () => {
      const before = await commentRepo.findOne({ where: { id: commentId } });
      const staleVersion = before!.version;

      // First update succeeds and advances the version in the DB
      await request(app.getHttpServer())
        .patch(`/tickets/${ticketId}/comments/${commentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ content: 'First update', version: staleVersion })
        .expect(200);

      // Second update with the same (now stale) version should conflict
      await request(app.getHttpServer())
        .patch(`/tickets/${ticketId}/comments/${commentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ content: 'Stale update', version: staleVersion })
        .expect(409);
    });

    it('succeeds when no version is provided (backwards-compatible)', async () => {
      await request(app.getHttpServer())
        .patch(`/tickets/${ticketId}/comments/${commentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ content: 'No version provided' })
        .expect(200);
    });
  });

  // ── DELETE /tickets/:ticketId/comments/:commentId ─────────────────────────

  describe('DELETE /tickets/:ticketId/comments/:commentId', () => {
    let commentId: number;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/comments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ content: 'Delete me' })
        .expect(200);
      commentId = res.body.id;
    });

    it('returns 401 without token', () => {
      return request(app.getHttpServer())
        .delete(`/tickets/${ticketId}/comments/${commentId}`)
        .expect(401);
    });

    it('deletes the comment and removes it from GET response', async () => {
      await request(app.getHttpServer())
        .delete(`/tickets/${ticketId}/comments/${commentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const listRes = await request(app.getHttpServer())
        .get(`/tickets/${ticketId}/comments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(listRes.body.find((c: any) => c.id === commentId)).toBeUndefined();
    });

    it('returns 404 for non-existent comment', async () => {
      return request(app.getHttpServer())
        .delete(`/tickets/${ticketId}/comments/999999`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

});
