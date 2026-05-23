import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SchedulerService } from './scheduler.service';

beforeAll(() => jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {}));
afterAll(() => jest.restoreAllMocks());
import { Ticket } from '../tickets/ticket.entity';
import { TicketsService } from '../tickets/tickets.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { TicketPriority, TicketStatus, TicketType } from '../tickets/enums';
import { ActorType } from '../audit-log/enums/actor-type.enum';

const makeTicket = (overrides: Partial<Ticket> = {}): Ticket =>
  ({
    id: 1,
    title: 'Overdue',
    status: TicketStatus.TODO,
    priority: TicketPriority.LOW,
    type: TicketType.TECHNICAL,
    projectId: 1,
    assigneeId: null,
    dueDate: new Date(Date.now() - 86400_000),
    isOverdue: false,
    version: 1,
    ...overrides,
  } as Ticket);

describe('SchedulerService', () => {
  let service: SchedulerService;
  let ticketRepo: { save: jest.Mock };
  let ticketsService: { findOverdueForEscalation: jest.Mock };
  let auditLogService: { record: jest.Mock };

  beforeEach(async () => {
    ticketRepo = { save: jest.fn().mockResolvedValue(undefined) };
    ticketsService = { findOverdueForEscalation: jest.fn() };
    auditLogService = { record: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulerService,
        { provide: getRepositoryToken(Ticket), useValue: ticketRepo },
        { provide: TicketsService, useValue: ticketsService },
        { provide: AuditLogService, useValue: auditLogService },
      ],
    }).compile();

    service = module.get(SchedulerService);
  });

  describe('runEscalation', () => {
    it('does nothing when there are no overdue tickets', async () => {
      ticketsService.findOverdueForEscalation.mockResolvedValue([]);

      await service.runEscalation();

      expect(ticketRepo.save).not.toHaveBeenCalled();
      expect(auditLogService.record).not.toHaveBeenCalled();
    });

    it('promotes LOW priority to MEDIUM', async () => {
      const ticket = makeTicket({ priority: TicketPriority.LOW });
      ticketsService.findOverdueForEscalation.mockResolvedValue([ticket]);

      await service.runEscalation();

      expect(ticket.priority).toBe(TicketPriority.MEDIUM);
      expect(ticketRepo.save).toHaveBeenCalledWith(ticket);
      expect(auditLogService.record).not.toHaveBeenCalled();
    });

    it('promotes MEDIUM priority to HIGH', async () => {
      const ticket = makeTicket({ priority: TicketPriority.MEDIUM });
      ticketsService.findOverdueForEscalation.mockResolvedValue([ticket]);

      await service.runEscalation();

      expect(ticket.priority).toBe(TicketPriority.HIGH);
      expect(auditLogService.record).not.toHaveBeenCalled();
    });

    it('promotes HIGH priority to CRITICAL', async () => {
      const ticket = makeTicket({ priority: TicketPriority.HIGH });
      ticketsService.findOverdueForEscalation.mockResolvedValue([ticket]);

      await service.runEscalation();

      expect(ticket.priority).toBe(TicketPriority.CRITICAL);
      expect(auditLogService.record).not.toHaveBeenCalled();
    });

    it('sets isOverdue=true for CRITICAL ticket that is not yet flagged', async () => {
      const ticket = makeTicket({ priority: TicketPriority.CRITICAL, isOverdue: false });
      ticketsService.findOverdueForEscalation.mockResolvedValue([ticket]);

      await service.runEscalation();

      expect(ticket.isOverdue).toBe(true);
      expect(ticketRepo.save).toHaveBeenCalledWith(ticket);
      expect(auditLogService.record).not.toHaveBeenCalled();
    });

    it('skips CRITICAL ticket that is already flagged as overdue', async () => {
      const ticket = makeTicket({ priority: TicketPriority.CRITICAL, isOverdue: true });
      ticketsService.findOverdueForEscalation.mockResolvedValue([ticket]);

      await service.runEscalation();

      expect(ticketRepo.save).not.toHaveBeenCalled();
      expect(auditLogService.record).not.toHaveBeenCalled();
    });

    it('logs error and returns early when the initial query throws', async () => {
      ticketsService.findOverdueForEscalation.mockRejectedValue(new Error('DB connection failed'));

      await service.runEscalation();

      expect(ticketRepo.save).not.toHaveBeenCalled();
      expect(auditLogService.record).not.toHaveBeenCalled();
    });

    it('continues processing remaining tickets when one fails', async () => {
      const failing = makeTicket({ id: 1, priority: TicketPriority.LOW });
      const succeeding = makeTicket({ id: 2, priority: TicketPriority.MEDIUM });
      ticketsService.findOverdueForEscalation.mockResolvedValue([failing, succeeding]);
      ticketRepo.save
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce(undefined);

      await service.runEscalation();

      expect(ticketRepo.save).toHaveBeenCalledTimes(2);
      expect(auditLogService.record).not.toHaveBeenCalled();
    });
  });
});
