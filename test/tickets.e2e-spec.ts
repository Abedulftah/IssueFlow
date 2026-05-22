import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import request from 'supertest';
import { UserRole } from '../src/users/user.entity';
import { Ticket } from '../src/tickets/ticket.entity';
import { TicketPriority, TicketStatus, TicketType } from '../src/tickets/enums';
import {
  bootstrapTestApp,
  closeTestApp,
  TestAppContext,
} from './support/test-app.bootstrap';
import { resetDatabase } from './support/db-reset.helper';

describe('Tickets API (e2e)', () => {
  let ctx: TestAppContext;
  let app: INestApplication;
  let adminToken: string;
  let adminUserId: number;
  let devUserId: number;
  let projectId: number;

  beforeAll(async () => {
    ctx = await bootstrapTestApp();
    app = ctx.app;
    await resetDatabase(ctx.dataSource);

    // Admin user
    const adminRes = await request(app.getHttpServer())
      .post('/users')
      .send({ username: 'tkt_admin', email: 'tkt_admin@test.com', fullName: 'Tkt Admin', role: UserRole.ADMIN })
      .expect(200);
    adminUserId = adminRes.body.id;

    // Developer user
    const devRes = await request(app.getHttpServer())
      .post('/users')
      .send({ username: 'tkt_dev', email: 'tkt_dev@test.com', fullName: 'Tkt Dev', role: UserRole.DEVELOPER })
      .expect(200);
    devUserId = devRes.body.id;

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'tkt_admin', password: 'secret' })
      .expect(200);
    adminToken = loginRes.body.accessToken;

    const projRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Ticket Test Project', description: 'e2e', ownerId: adminUserId })
      .expect(200);
    projectId = projRes.body.id;
  });

  afterAll(async () => {
    await resetDatabase(ctx.dataSource);
    await closeTestApp(ctx);
  });

  // ── POST /tickets ─────────────────────────────────────────────────────────

  describe('POST /tickets', () => {
    it('returns 401 without token', () => {
      return request(app.getHttpServer())
        .post('/tickets')
        .send({ title: 'x', priority: TicketPriority.LOW, type: TicketType.TECHNICAL, projectId })
        .expect(401);
    });

    it('creates a ticket with explicit assigneeId and returns correct shape', async () => {
      const res = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Fix login bug',
          description: 'Login fails intermittently',
          status: TicketStatus.TODO,
          priority: TicketPriority.HIGH,
          type: TicketType.BUG,
          projectId,
          assigneeId: devUserId,
          dueDate: '2026-04-01T00:00:00Z',
        })
        .expect(200);

      expect(res.body).toMatchObject({
        id: expect.any(Number),
        title: 'Fix login bug',
        description: 'Login fails intermittently',
        status: TicketStatus.TODO,
        priority: TicketPriority.HIGH,
        type: TicketType.BUG,
        projectId,
        assigneeId: devUserId,
        isOverdue: false,
      });
      expect(res.body.dueDate).toBeDefined();
      // Hidden fields must not be exposed
      expect(res.body.createdAt).toBeUndefined();
      expect(res.body.updatedAt).toBeUndefined();
      expect(res.body.version).toBeUndefined();
    });

    it('returns 404 when projectId does not exist', async () => {
      return request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'x', priority: TicketPriority.LOW, type: TicketType.TECHNICAL, projectId: 999999 })
        .expect(404);
    });

    it('returns 404 when assigneeId does not exist', async () => {
      return request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'x', priority: TicketPriority.LOW, type: TicketType.TECHNICAL, projectId, assigneeId: 999999 })
        .expect(404);
    });

    it('returns 400 when required fields are missing', async () => {
      return request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'No priority' })
        .expect(400);
    });
  });

  // ── Auto-assignment ───────────────────────────────────────────────────────

  describe('Auto-assignment (no assigneeId supplied)', () => {
    it('assigns the DEVELOPER with fewest non-DONE tickets', async () => {
      const res = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Auto-assign ticket',
          priority: TicketPriority.LOW,
          type: TicketType.TECHNICAL,
          projectId,
        })
        .expect(200);

      expect(res.body.assigneeId).toBe(devUserId);
    });

  });

  // ── GET /tickets?projectId ────────────────────────────────────────────────

  describe('GET /tickets?projectId', () => {
    it('returns 401 without token', () => {
      return request(app.getHttpServer()).get(`/tickets?projectId=${projectId}`).expect(401);
    });

    it('returns an array of tickets for the given project', async () => {
      const res = await request(app.getHttpServer())
        .get(`/tickets?projectId=${projectId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.every((t: any) => t.projectId === projectId)).toBe(true);

      if (res.body.length > 0) {
        const t = res.body[0];
        expect(t).toHaveProperty('id');
        expect(t).toHaveProperty('title');
        expect(t).toHaveProperty('status');
        expect(t).toHaveProperty('priority');
        expect(t).toHaveProperty('type');
        expect(t).toHaveProperty('projectId');
        expect(t).toHaveProperty('isOverdue');
      }
    });

    it('returns 400 when projectId is missing', () => {
      return request(app.getHttpServer())
        .get('/tickets')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });
  });

  // ── GET /tickets/:ticketId ────────────────────────────────────────────────

  describe('GET /tickets/:ticketId', () => {
    let ticketId: number;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Get by ID', priority: TicketPriority.MEDIUM, type: TicketType.FEATURE, projectId })
        .expect(200);
      ticketId = res.body.id;
    });

    it('returns the ticket with correct shape', async () => {
      const res = await request(app.getHttpServer())
        .get(`/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id: ticketId,
        title: 'Get by ID',
        status: TicketStatus.TODO,
        priority: TicketPriority.MEDIUM,
        type: TicketType.FEATURE,
        projectId,
        isOverdue: false,
      });
    });

    it('returns 404 for non-existent ticket', async () => {
      return request(app.getHttpServer())
        .get('/tickets/999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  // ── PATCH /tickets/:ticketId ──────────────────────────────────────────────

  describe('PATCH /tickets/:ticketId', () => {
    let ticketId: number;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Patch me', priority: TicketPriority.LOW, type: TicketType.TECHNICAL, projectId, assigneeId: devUserId })
        .expect(200);
      ticketId = res.body.id;
    });

    it('returns 401 without token', () => {
      return request(app.getHttpServer())
        .patch(`/tickets/${ticketId}`)
        .send({ title: 'New title' })
        .expect(401);
    });

    it('updates ticket fields', async () => {
      await request(app.getHttpServer())
        .patch(`/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Updated title', priority: TicketPriority.HIGH })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.title).toBe('Updated title');
      expect(res.body.priority).toBe(TicketPriority.HIGH);
    });

    it('returns 404 for non-existent ticket', async () => {
      return request(app.getHttpServer())
        .patch('/tickets/999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Ghost' })
        .expect(404);
    });
  });

  // ── Ticket Status Lifecycle ───────────────────────────────────────────────

  describe('Ticket status lifecycle (forward-only transitions)', () => {
    let ticketId: number;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Lifecycle ticket', priority: TicketPriority.LOW, type: TicketType.TECHNICAL, projectId, assigneeId: devUserId })
        .expect(200);
      ticketId = res.body.id;
    });

    it('allows TODO → IN_PROGRESS', async () => {
      await request(app.getHttpServer())
        .patch(`/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: TicketStatus.IN_PROGRESS })
        .expect(200);
    });

    it('rejects backward transition IN_PROGRESS → TODO', async () => {
      await request(app.getHttpServer())
        .patch(`/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: TicketStatus.TODO })
        .expect(400);
    });

    it('rejects skipping a step: IN_PROGRESS → DONE', async () => {
      await request(app.getHttpServer())
        .patch(`/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: TicketStatus.DONE })
        .expect(400);
    });

    it('allows IN_PROGRESS → IN_REVIEW', async () => {
      await request(app.getHttpServer())
        .patch(`/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: TicketStatus.IN_REVIEW })
        .expect(200);
    });

    it('allows IN_REVIEW → DONE', async () => {
      await request(app.getHttpServer())
        .patch(`/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: TicketStatus.DONE })
        .expect(200);
    });

    it('rejects any update on a DONE ticket', async () => {
      await request(app.getHttpServer())
        .patch(`/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Cannot update DONE ticket' })
        .expect(400);
    });
  });

  // ── Optimistic locking ────────────────────────────────────────────────────

  describe('Optimistic locking (version mismatch → 409)', () => {
    let ticketId: number;
    let ticketRepo: Repository<Ticket>;

    beforeAll(async () => {
      ticketRepo = ctx.moduleRef.get<Repository<Ticket>>(getRepositoryToken(Ticket));

      const res = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Lock ticket', priority: TicketPriority.LOW, type: TicketType.TECHNICAL, projectId, assigneeId: devUserId })
        .expect(200);
      ticketId = res.body.id;
    });

    it('returns 409 when the client sends a stale version', async () => {
      // Read the actual current version from the DB (version is excluded from API responses)
      const before = await ticketRepo.findOne({ where: { id: ticketId } });
      const staleVersion = before!.version;

      // First update succeeds and advances the version in the DB
      await request(app.getHttpServer())
        .patch(`/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'First update', version: staleVersion })
        .expect(200);

      // Second update with the same (now stale) version should conflict
      await request(app.getHttpServer())
        .patch(`/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Stale update', version: staleVersion })
        .expect(409);
    });
  });

  // ── DELETE /tickets/:ticketId (soft-delete) ───────────────────────────────

  describe('DELETE /tickets/:ticketId (soft-delete)', () => {
    it('returns 401 without token', async () => {
      const res = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'del test', priority: TicketPriority.LOW, type: TicketType.TECHNICAL, projectId })
        .expect(200);

      return request(app.getHttpServer()).delete(`/tickets/${res.body.id}`).expect(401);
    });

    it('soft-deletes a ticket – it disappears from GET /tickets?projectId', async () => {
      const res = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Soft delete me', priority: TicketPriority.LOW, type: TicketType.TECHNICAL, projectId })
        .expect(200);
      const delId = res.body.id;

      await request(app.getHttpServer())
        .delete(`/tickets/${delId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const listRes = await request(app.getHttpServer())
        .get(`/tickets?projectId=${projectId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(listRes.body.find((t: any) => t.id === delId)).toBeUndefined();
    });

    it('returns 404 for non-existent ticket', async () => {
      return request(app.getHttpServer())
        .delete('/tickets/999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  // ── GET /tickets/deleted (ADMIN-only) ─────────────────────────────────────

  describe('GET /tickets/deleted?projectId', () => {
    it('returns 401 without token', () => {
      return request(app.getHttpServer())
        .get(`/tickets/deleted?projectId=${projectId}`)
        .expect(401);
    });

    it('returns a list of soft-deleted tickets', async () => {
      const res = await request(app.getHttpServer())
        .get(`/tickets/deleted?projectId=${projectId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ── POST /tickets/:ticketId/restore ───────────────────────────────────────

  describe('POST /tickets/:ticketId/restore', () => {
    it('returns 401 without token', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Restore auth test', priority: TicketPriority.LOW, type: TicketType.TECHNICAL, projectId })
        .expect(200);
      const id = createRes.body.id;

      await request(app.getHttpServer())
        .delete(`/tickets/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      return request(app.getHttpServer()).post(`/tickets/${id}/restore`).expect(401);
    });

    it('restores a soft-deleted ticket', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Restore me', priority: TicketPriority.LOW, type: TicketType.TECHNICAL, projectId })
        .expect(200);
      const restoreId = createRes.body.id;

      await request(app.getHttpServer())
        .delete(`/tickets/${restoreId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/tickets/${restoreId}/restore`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const listRes = await request(app.getHttpServer())
        .get(`/tickets?projectId=${projectId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(listRes.body.find((t: any) => t.id === restoreId)).toBeDefined();
    });

    it('returns 404 when ticket does not exist', () => {
      return request(app.getHttpServer())
        .post('/tickets/999999/restore')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('returns 400 when ticket is not deleted', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Active ticket restore', priority: TicketPriority.LOW, type: TicketType.TECHNICAL, projectId })
        .expect(200);

      return request(app.getHttpServer())
        .post(`/tickets/${createRes.body.id}/restore`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });
  });

  // ── GET /tickets/export?projectId (CSV) ───────────────────────────────────

  describe('GET /tickets/export?projectId', () => {
    it('returns 401 without token', () => {
      return request(app.getHttpServer())
        .get(`/tickets/export?projectId=${projectId}`)
        .expect(401);
    });

    it('returns a CSV file with correct Content-Type and required columns', async () => {
      const res = await request(app.getHttpServer())
        .get(`/tickets/export?projectId=${projectId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.headers['content-type']).toMatch(/text\/csv/);
      const csv: string = res.text;
      const headers = csv.split('\n')[0];
      // README requires: id, title, description, status, priority, type, assigneeId
      expect(headers).toContain('id');
      expect(headers).toContain('title');
      expect(headers).toContain('status');
      expect(headers).toContain('priority');
      expect(headers).toContain('type');
      expect(headers).toContain('assigneeId');
    });
  });

  // ── POST /tickets/import (CSV upload) ────────────────────────────────────

  describe('POST /tickets/import', () => {
    it('returns 401 without token', () => {
      return request(app.getHttpServer())
        .post('/tickets/import')
        .expect(401);
    });

    it('imports tickets from CSV and returns { created, failed, errors } with exact counts', async () => {
      const csvContent = [
        'title,description,status,priority,type',
        'Imported ticket 1,desc1,TODO,LOW,TECHNICAL',
        'Imported ticket 2,desc2,TODO,MEDIUM,BUG',
        'Bad row,,INVALID_STATUS,LOW,TECHNICAL',
      ].join('\n');

      const res = await request(app.getHttpServer())
        .post('/tickets/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('projectId', String(projectId))
        .attach('file', Buffer.from(csvContent), { filename: 'tickets.csv', contentType: 'text/csv' })
        .expect(200);

      expect(res.body).toMatchObject({
        created: expect.any(Number),
        failed: expect.any(Number),
        errors: expect.any(Array),
      });
      expect(res.body.created).toBe(2);
      expect(res.body.failed).toBe(1);
      expect(res.body.errors).toHaveLength(1);
    });

    it('returns 400 when no file is attached', () => {
      return request(app.getHttpServer())
        .post('/tickets/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('projectId', String(projectId))
        .expect(400);
    });
  });
});
