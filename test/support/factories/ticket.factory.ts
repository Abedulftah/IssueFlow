import {
  TicketPriority,
  TicketStatus,
  TicketType,
} from '../../../src/tickets/enums';

export interface TicketPayload {
  title: string;
  description?: string;
  status?: TicketStatus;
  priority: TicketPriority;
  type: TicketType;
  projectId: number;
  assigneeId?: number;
  dueDate?: string;
}

let counter = 0;

export function makeTicketPayload(
  projectId: number,
  overrides: Partial<TicketPayload> = {},
): TicketPayload {
  counter += 1;
  return {
    title: `Ticket ${counter}`,
    description: 'created in e2e',
    priority: TicketPriority.MEDIUM,
    type: TicketType.TECHNICAL,
    projectId,
    ...overrides,
  };
}
