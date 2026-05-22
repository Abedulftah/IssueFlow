import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ticket } from '../tickets/ticket.entity';
import { TicketPriority } from '../tickets/enums';
import { TicketsService } from '../tickets/tickets.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { ActorType } from '../audit-log/enums/actor-type.enum';

const PRIORITY_ORDER = [
  TicketPriority.LOW,
  TicketPriority.MEDIUM,
  TicketPriority.HIGH,
  TicketPriority.CRITICAL,
];

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepo: Repository<Ticket>,
    private readonly ticketsService: TicketsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Cron(process.env.ESCALATION_CRON ?? '*/5 * * * *')
  async runEscalation(): Promise<void> {
    let tickets: Ticket[];
    try {
      tickets = await this.ticketsService.findOverdueForEscalation();
    } catch (err) {
      this.logger.error('Escalation query failed', err);
      return;
    }

    for (const ticket of tickets) {
      try {
        const idx = PRIORITY_ORDER.indexOf(ticket.priority);

        if (ticket.priority === TicketPriority.CRITICAL) {
          if (ticket.isOverdue) continue;
          ticket.isOverdue = true;
        } else {
          ticket.priority = PRIORITY_ORDER[idx + 1];
        }

        await this.ticketRepo.save(ticket);
      } catch (err) {
        this.logger.error(`Escalation failed for ticket ${ticket.id}`, err);
      }
    }
  }
}
