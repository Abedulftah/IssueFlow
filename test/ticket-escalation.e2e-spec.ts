import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import request from 'supertest';
import { SchedulerService } from '../src/scheduler/scheduler.service';
import { SchedulerModule } from '../src/scheduler/scheduler.module';
import { Ticket } from '../src/tickets/ticket.entity';
import { AuditLog } from '../src/audit-log/entities/audit-log.entity';
import { TicketPriority, TicketStatus, TicketType } from '../src/tickets/enums';
import { UserRole } from '../src/users/user.entity';
import {
  bootstrapTestApp,
  closeTestApp,
  TestAppContext,
} from './support/test-app.bootstrap';
import { resetDatabase } from './support/db-reset.helper';
import { getDefaultAdminToken } from './support/auth.helper';

const PAST_DATE = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago

describe('Ticket Auto-Escalation (e2e)', () => {
  let ctx: TestAppContext;
  let app: INestApplication;
  let schedulerService: SchedulerService;
  let ticketRepo: Repository<Ticket>;
  let auditRepo: Repository<AuditLog>;
  let adminToken: string;
  let projectId: number;

  beforeAll(async () => {
    ctx = await bootstrapTestApp({ extraModules: [SchedulerModule] });
    app = ctx.app;
    schedulerService = app.get(SchedulerService);
    ticketRepo = ctx.moduleRef.get(getRepositoryToken(Ticket));
    auditRepo = ctx.moduleRef.get(getRepositoryToken(AuditLog));

    await resetDatabase(ctx.dataSource);

    const defaultAdminToken = await getDefaultAdminToken(app);

    const userRes = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${defaultAdminToken}`)
      .send({ username: 'esc_admin', email: 'esc_admin@test.com', fullName: 'Esc Admin', role: UserRole.ADMIN, password: 'secret' });
    const adminUserId: number = userRes.body.id;

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'esc_admin', password: 'secret' });
    adminToken = loginRes.body.accessToken;

    const projRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Escalation Test Project', description: 'e2e', ownerId: adminUserId });
    projectId = projRes.body.id;
  });

  afterAll(async () => {
    await resetDatabase(ctx.dataSource);
    await closeTestApp(ctx);
  });

  async function clearTicketsAndAudit() {
    await auditRepo.createQueryBuilder().delete().execute();
    await ticketRepo.query('DELETE FROM ticket_blocker');
    await ticketRepo.createQueryBuilder().delete().execute();
  }

  async function createTicket(priority: TicketPriority, dueDate: string | null = PAST_DATE): Promise<number> {
    const body: any = {
      title: `Escalation test ticket`,
      priority,
      type: TicketType.BUG,
      projectId,
      assigneeId: null,
    };
    if (dueDate !== null) body.dueDate = dueDate;

    const res = await request(app.getHttpServer())
      .post('/tickets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body)
      .expect(200);
    return res.body.id;
  }

  // ── 6.2 LOW → MEDIUM ────────────────────────────────────────────────────────

  it('6.2 escalates LOW → MEDIUM; isOverdue stays false', async () => {
    await clearTicketsAndAudit();
    const id = await createTicket(TicketPriority.LOW);

    await schedulerService.runEscalation();

    const res = await request(app.getHttpServer())
      .get(`/tickets/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.priority).toBe(TicketPriority.MEDIUM);
    expect(res.body.isOverdue).toBe(false);
  });

  // ── 6.3 MEDIUM → HIGH ────────────────────────────────────────────────────────

  it('6.3 escalates MEDIUM → HIGH; isOverdue stays false', async () => {
    await clearTicketsAndAudit();
    const id = await createTicket(TicketPriority.MEDIUM);

    await schedulerService.runEscalation();

    const res = await request(app.getHttpServer())
      .get(`/tickets/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.priority).toBe(TicketPriority.HIGH);
    expect(res.body.isOverdue).toBe(false);
  });

  // ── 6.4 HIGH → CRITICAL ──────────────────────────────────────────────────────

  it('6.4 escalates HIGH → CRITICAL; isOverdue is false (needs another run to flag)', async () => {
    await clearTicketsAndAudit();
    const id = await createTicket(TicketPriority.HIGH);

    await schedulerService.runEscalation();

    const res = await request(app.getHttpServer())
      .get(`/tickets/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.priority).toBe(TicketPriority.CRITICAL);
    expect(res.body.isOverdue).toBe(false);
  });

  // ── 6.5 CRITICAL → isOverdue = true ─────────────────────────────────────────

  it('6.5 sets isOverdue=true for a CRITICAL overdue ticket; priority stays CRITICAL', async () => {
    await clearTicketsAndAudit();
    const id = await createTicket(TicketPriority.CRITICAL);

    await schedulerService.runEscalation();

    const res = await request(app.getHttpServer())
      .get(`/tickets/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.priority).toBe(TicketPriority.CRITICAL);
    expect(res.body.isOverdue).toBe(true);
  });

  // ── 6.6 Idempotency ──────────────────────────────────────────────────────────

  it('6.6 running escalation twice on a CRITICAL overdue ticket is idempotent', async () => {
    await clearTicketsAndAudit();
    const id = await createTicket(TicketPriority.CRITICAL);

    await schedulerService.runEscalation();
    await schedulerService.runEscalation();

    const res = await request(app.getHttpServer())
      .get(`/tickets/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.priority).toBe(TicketPriority.CRITICAL);
    expect(res.body.isOverdue).toBe(true);

    const auditEntries = await auditRepo.find({
      where: { action: 'ESCALATION', entityId: String(id) },
    });
    expect(auditEntries).toHaveLength(1);
  });

  // ── Future dueDate → skip ────────────────────────────────────────────────────

  it('does not escalate a ticket whose dueDate is in the future', async () => {
    await clearTicketsAndAudit();
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days from now

    const body: any = {
      title: 'Future due ticket',
      priority: TicketPriority.LOW,
      type: TicketType.BUG,
      projectId,
    };
    body.dueDate = futureDate;
    const res = await request(app.getHttpServer())
      .post('/tickets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body)
      .expect(200);
    const id = res.body.id;

    await schedulerService.runEscalation();

    const after = await request(app.getHttpServer())
      .get(`/tickets/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(after.body.priority).toBe(TicketPriority.LOW);
    expect(after.body.isOverdue).toBe(false);
  });

  // ── 6.7 No dueDate → skip ────────────────────────────────────────────────────

  it('6.7 skips ticket with dueDate=null', async () => {
    await clearTicketsAndAudit();
    const id = await createTicket(TicketPriority.LOW, null);

    await schedulerService.runEscalation();

    const res = await request(app.getHttpServer())
      .get(`/tickets/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.priority).toBe(TicketPriority.LOW);
    expect(res.body.isOverdue).toBe(false);
  });

  // ── 6.8 DONE ticket → skip ───────────────────────────────────────────────────

  it('6.8 skips DONE tickets even with past dueDate', async () => {
    await clearTicketsAndAudit();

    // Create LOW ticket, manually advance status to DONE via service (3-step transition)
    const id = await createTicket(TicketPriority.LOW);
    await request(app.getHttpServer())
      .patch(`/tickets/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: TicketStatus.IN_PROGRESS })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/tickets/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: TicketStatus.IN_REVIEW })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/tickets/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: TicketStatus.DONE })
      .expect(200);

    await schedulerService.runEscalation();

    const res = await request(app.getHttpServer())
      .get(`/tickets/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.priority).toBe(TicketPriority.LOW);
    expect(res.body.isOverdue).toBe(false);
  });

  // ── 6.9 Audit log entry on escalation ────────────────────────────────────────

  it('6.9 creates a single ESCALATION audit log entry per escalated ticket', async () => {
    await clearTicketsAndAudit();
    const id = await createTicket(TicketPriority.LOW);

    await schedulerService.runEscalation();

    const escalationLogs = await request(app.getHttpServer())
      .get(`/audit-logs?entityType=TICKET&entityId=${id}&action=ESCALATION`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const updateLogs = await request(app.getHttpServer())
      .get(`/audit-logs?entityType=TICKET&entityId=${id}&action=UPDATE`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(escalationLogs.body).toHaveLength(1);
    expect(escalationLogs.body[0].action).toBe('ESCALATION');
    expect(escalationLogs.body[0].actor).toBe('SYSTEM');
    expect(escalationLogs.body[0].entityId).toBe(id);
    expect(updateLogs.body).toHaveLength(0);
  });

  // ── 6.10 No audit entry for skipped ticket ───────────────────────────────────

  it('6.10 no audit ESCALATE entry for skipped (null dueDate) ticket', async () => {
    await clearTicketsAndAudit();
    const id = await createTicket(TicketPriority.LOW, null);

    await schedulerService.runEscalation();

    const res = await request(app.getHttpServer())
      .get(`/audit-logs?entityType=TICKET&entityId=${id}&action=UPDATE`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body).toHaveLength(0);
  });

  // ── 6.11 Manual priority update clears isOverdue ─────────────────────────────

  it('6.11 PATCH with priority clears isOverdue even when dueDate still in past', async () => {
    await clearTicketsAndAudit();
    const id = await createTicket(TicketPriority.CRITICAL);

    await schedulerService.runEscalation();

    // Confirm isOverdue is true
    const before = await request(app.getHttpServer())
      .get(`/tickets/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(before.body.isOverdue).toBe(true);

    // Manual priority patch (same value is fine — reset still applies)
    await request(app.getHttpServer())
      .patch(`/tickets/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ priority: TicketPriority.CRITICAL })
      .expect(200);

    const after = await request(app.getHttpServer())
      .get(`/tickets/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(after.body.isOverdue).toBe(false);
    expect(after.body.priority).toBe(TicketPriority.CRITICAL);
  });

  // ── 6.12 Update without priority does not clear isOverdue ────────────────────

  it('6.12 PATCH without priority field leaves isOverdue unchanged', async () => {
    await clearTicketsAndAudit();
    const id = await createTicket(TicketPriority.CRITICAL);

    await schedulerService.runEscalation();

    // isOverdue should be true now
    const check = await request(app.getHttpServer())
      .get(`/tickets/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(check.body.isOverdue).toBe(true);

    await request(app.getHttpServer())
      .patch(`/tickets/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Updated title only' })
      .expect(200);

    const after = await request(app.getHttpServer())
      .get(`/tickets/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(after.body.isOverdue).toBe(true);
  });

  // ── 6.13 Escalation re-evaluates after manual reset ──────────────────────────

  it('6.13 after manual reset to HIGH, next escalation promotes to CRITICAL (isOverdue=false)', async () => {
    await clearTicketsAndAudit();
    const id = await createTicket(TicketPriority.CRITICAL);

    // First run: sets isOverdue = true
    await schedulerService.runEscalation();

    // Manual reset to HIGH (clears isOverdue)
    await request(app.getHttpServer())
      .patch(`/tickets/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ priority: TicketPriority.HIGH })
      .expect(200);

    // Second run: HIGH → CRITICAL, isOverdue stays false
    await schedulerService.runEscalation();

    const res = await request(app.getHttpServer())
      .get(`/tickets/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.priority).toBe(TicketPriority.CRITICAL);
    expect(res.body.isOverdue).toBe(false);
  });

  // ── 6.14 Re-run after reset reaches CRITICAL with isOverdue again ─────────────

  it('6.14 third run after manual reset sets isOverdue=true again', async () => {
    await clearTicketsAndAudit();
    const id = await createTicket(TicketPriority.CRITICAL);

    // Run 1: CRITICAL → isOverdue = true
    await schedulerService.runEscalation();

    // Manual reset to HIGH
    await request(app.getHttpServer())
      .patch(`/tickets/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ priority: TicketPriority.HIGH })
      .expect(200);

    // Run 2: HIGH → CRITICAL, isOverdue = false
    await schedulerService.runEscalation();

    // Run 3: CRITICAL and overdue → isOverdue = true
    await schedulerService.runEscalation();

    const res = await request(app.getHttpServer())
      .get(`/tickets/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.priority).toBe(TicketPriority.CRITICAL);
    expect(res.body.isOverdue).toBe(true);
  });
});
