import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import request from 'supertest';
import { UserRole } from '../src/users/user.entity';
import { Ticket } from '../src/tickets/ticket.entity';
import { Comment } from '../src/comments/comment.entity';
import { Project } from '../src/projects/project.entity';
import { TicketPriority, TicketType } from '../src/tickets/enums';
import {
  bootstrapTestApp,
  closeTestApp,
  TestAppContext,
} from './support/test-app.bootstrap';
import { resetDatabase } from './support/db-reset.helper';

describe('User ticket re-auto-assignment (e2e)', () => {
  let ctx: TestAppContext;
  let app: INestApplication;
  let ticketRepo: Repository<Ticket>;
  let commentRepo: Repository<Comment>;
  let projectRepo: Repository<Project>;
  let adminToken: string;
  let projectId: number;
  let devCounter = 0;

  beforeAll(async () => {
    ctx = await bootstrapTestApp();
    app = ctx.app;
    ticketRepo = ctx.moduleRef.get(getRepositoryToken(Ticket));
    commentRepo = ctx.moduleRef.get(getRepositoryToken(Comment));
    projectRepo = ctx.moduleRef.get(getRepositoryToken(Project));
  });

  afterAll(async () => {
    await resetDatabase(ctx.dataSource);
    await closeTestApp(ctx);
  });

  beforeEach(async () => {
    await resetDatabase(ctx.dataSource);
    devCounter = 0;

    const adminRes = await request(app.getHttpServer())
      .post('/users')
      .send({ username: 'ra_admin', email: 'ra_admin@test.com', fullName: 'RA Admin', role: UserRole.ADMIN, password: 'secret' });
    const adminUserId = adminRes.body.id;

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'ra_admin', password: 'secret' });
    adminToken = loginRes.body.accessToken;

    const projRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'RA Project', description: 'reassign tests', ownerId: adminUserId });
    projectId = projRes.body.id;
  });

  function nextDev() {
    devCounter++;
    return {
      username: `ra_dev_${devCounter}`,
      email: `ra_dev_${devCounter}@test.com`,
      fullName: `RA Dev ${devCounter}`,
      role: UserRole.DEVELOPER,
      password: 'secret',
    };
  }

  async function createDev(): Promise<number> {
    const res = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(nextDev());
    return res.body.id;
  }

  async function createTicket(assigneeId: number): Promise<number> {
    const res = await request(app.getHttpServer())
      .post('/tickets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'RA Ticket', priority: TicketPriority.LOW, type: TicketType.TECHNICAL, projectId, assigneeId });
    return res.body.id;
  }

  async function softDeleteTicket(ticketId: number): Promise<void> {
    await request(app.getHttpServer())
      .delete(`/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${adminToken}`);
  }

  // ── DELETE /users/:id ─────────────────────────────────────────────────────

  describe('DELETE /users/:id — ticket re-assignment', () => {
    it('re-assigns active ticket to another developer when user is deleted', async () => {
      const dev1 = await createDev();
      const dev2 = await createDev();

      await createTicket(dev2);                   // links dev2 to project
      const ticketId = await createTicket(dev1);  // active ticket for dev1

      await request(app.getHttpServer())
        .delete(`/users/${dev1}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const updated = await ticketRepo.findOne({ where: { id: ticketId } });
      expect(updated.assigneeId).toBe(dev2);
    });

    it('re-assigns soft-deleted ticket when user is deleted', async () => {
      const dev1 = await createDev();
      const dev2 = await createDev();

      await createTicket(dev2);                   // links dev2 to project
      const ticketId = await createTicket(dev1);  // ticket for dev1
      await softDeleteTicket(ticketId);           // soft-delete it

      await request(app.getHttpServer())
        .delete(`/users/${dev1}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const updated = await ticketRepo.findOne({ where: { id: ticketId }, withDeleted: true });
      expect(updated.assigneeId).toBe(dev2);
    });
  });

  // ── POST /users/update/:id — DEVELOPER → ADMIN ────────────────────────────

  describe('POST /users/update/:id — DEVELOPER promoted to ADMIN', () => {
    it('re-assigns active ticket when developer is promoted to ADMIN', async () => {
      const dev1 = await createDev();
      const dev2 = await createDev();

      await createTicket(dev2);                   // links dev2 to project
      const ticketId = await createTicket(dev1);  // active ticket for dev1

      await request(app.getHttpServer())
        .post(`/users/update/${dev1}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: UserRole.ADMIN })
        .expect(200);

      const updated = await ticketRepo.findOne({ where: { id: ticketId } });
      expect(updated.assigneeId).toBe(dev2);
    });

    it('re-assigns soft-deleted ticket when developer is promoted to ADMIN', async () => {
      const dev1 = await createDev();
      const dev2 = await createDev();

      await createTicket(dev2);                   // links dev2 to project
      const ticketId = await createTicket(dev1);  // ticket for dev1
      await softDeleteTicket(ticketId);           // soft-delete it

      await request(app.getHttpServer())
        .post(`/users/update/${dev1}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: UserRole.ADMIN })
        .expect(200);

      const updated = await ticketRepo.findOne({ where: { id: ticketId }, withDeleted: true });
      expect(updated.assigneeId).toBe(dev2);
    });

    it('does not re-assign tickets when ADMIN role is updated but stays ADMIN', async () => {
      const dev1 = await createDev();
      const dev2 = await createDev();

      await createTicket(dev2);                   // links dev2 to project
      const ticketId = await createTicket(dev1);  // ticket for dev1

      // First promote dev1 to ADMIN (tickets get re-assigned here)
      await request(app.getHttpServer())
        .post(`/users/update/${dev1}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: UserRole.ADMIN });

      const afterPromotion = await ticketRepo.findOne({ where: { id: ticketId } });
      const assigneeAfterPromotion = afterPromotion.assigneeId;

      // Second update — still ADMIN, no re-assignment should happen
      await request(app.getHttpServer())
        .post(`/users/update/${dev1}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: UserRole.ADMIN, fullName: 'Updated Name' })
        .expect(200);

      const unchanged = await ticketRepo.findOne({ where: { id: ticketId } });
      expect(unchanged.assigneeId).toBe(assigneeAfterPromotion);
    });
  });

  // ── DELETE /users/:id — comments ──────────────────────────────────────────

  describe('DELETE /users/:id — comment authorId nullified', () => {
    it('sets authorId to null on comments when the author is deleted', async () => {
      const dev1 = await createDev();
      const dev1Username = `ra_dev_${devCounter}`;

      const dev1LoginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: dev1Username, password: 'secret' });
      const dev1Token = dev1LoginRes.body.accessToken;

      const ticketId = await createTicket(dev1);

      const commentRes = await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/comments`)
        .set('Authorization', `Bearer ${dev1Token}`)
        .send({ content: 'This comment will lose its author' });
      const commentId = commentRes.body.id;

      await request(app.getHttpServer())
        .delete(`/users/${dev1}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const comment = await commentRepo.findOne({ where: { id: commentId } });
      expect(comment.authorId).toBeNull();
    });
  });

  // ── DELETE /users/:id — soft-deleted projects ─────────────────────────────

  describe('DELETE /users/:id — project ownerId nullified', () => {
    it('sets ownerId to null on an active project when the owner is deleted', async () => {
      const dev1 = await createDev();

      const projRes = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Dev1 Project', description: 'owned by dev1', ownerId: dev1 });
      const ownedProjectId = projRes.body.id;

      await request(app.getHttpServer())
        .delete(`/users/${dev1}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const project = await projectRepo.findOne({ where: { id: ownedProjectId } });
      expect(project.ownerId).toBeNull();
    });

    it('sets ownerId to null on a soft-deleted project when the owner is deleted', async () => {
      const dev1 = await createDev();

      const projRes = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Dev1 Soft Project', description: 'owned by dev1', ownerId: dev1 });
      const ownedProjectId = projRes.body.id;

      // Soft-delete the project
      await request(app.getHttpServer())
        .delete(`/projects/${ownedProjectId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      await request(app.getHttpServer())
        .delete(`/users/${dev1}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const project = await projectRepo.findOne({ where: { id: ownedProjectId }, withDeleted: true });
      expect(project.ownerId).toBeNull();
    });
  });
});
