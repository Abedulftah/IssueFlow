import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Request, Response } from 'express';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { TicketStatus, TicketPriority, TicketType } from './enums';
import { Ticket } from './ticket.entity';

const mockTicketsService = () => ({
  exportToCsv: jest.fn(),
  importFromCsv: jest.fn(),
  findDeleted: jest.fn(),
  findAllByProject: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
  restore: jest.fn(),
});

const makeTicket = (overrides: Partial<Ticket> = {}): Ticket =>
  ({
    id: 1,
    title: 'Test',
    status: TicketStatus.TODO,
    priority: TicketPriority.MEDIUM,
    type: TicketType.TECHNICAL,
    projectId: 1,
    ...overrides,
  } as Ticket);

const mockReq = (userId = 1) => ({ user: { id: userId } } as unknown as Request);

describe('TicketsController', () => {
  let controller: TicketsController;
  let service: ReturnType<typeof mockTicketsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TicketsController],
      providers: [{ provide: TicketsService, useFactory: mockTicketsService }],
    }).compile();

    controller = module.get(TicketsController);
    service = module.get(TicketsService);
  });

  describe('exportCsv', () => {
    it('sets CSV headers and sends the CSV body', async () => {
      service.exportToCsv.mockResolvedValue('id,title\n1,Test');
      const mockSet = jest.fn();
      const mockSend = jest.fn();
      const res = { set: mockSet, send: mockSend } as unknown as Response;

      await controller.exportCsv({ projectId: '1' }, res);

      expect(service.exportToCsv).toHaveBeenCalledWith('1');
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ 'Content-Type': 'text/csv' }),
      );
      expect(mockSend).toHaveBeenCalledWith('id,title\n1,Test');
    });
  });

  describe('importCsv', () => {
    it('delegates to service with projectId and file buffer', async () => {
      const result = { created: 2, failed: 0, errors: [] };
      service.importFromCsv.mockResolvedValue(result);
      const file = { buffer: Buffer.from('csv') } as Express.Multer.File;

      const res = await controller.importCsv({ projectId: '1' }, file);

      expect(service.importFromCsv).toHaveBeenCalledWith('1', file.buffer);
      expect(res).toBe(result);
    });

    it('throws 400 when no file is provided', async () => {
      await expect(
        controller.importCsv({ projectId: '1' }, undefined as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findDeleted', () => {
    it('returns deleted tickets without projectId filter', async () => {
      const tickets = [makeTicket()];
      service.findDeleted.mockResolvedValue(tickets);

      const result = await controller.findDeleted();

      expect(service.findDeleted).toHaveBeenCalledWith(undefined);
      expect(result).toBe(tickets);
    });

    it('passes parsed projectId when provided', async () => {
      service.findDeleted.mockResolvedValue([]);
      await controller.findDeleted('5');
      expect(service.findDeleted).toHaveBeenCalledWith(5);
    });

    it('passes undefined when projectId is not a valid number', async () => {
      service.findDeleted.mockResolvedValue([]);
      await controller.findDeleted('abc');
      expect(service.findDeleted).toHaveBeenCalledWith(undefined);
    });
  });

  describe('findAll', () => {
    it('delegates to service with projectId', async () => {
      const tickets = [makeTicket()];
      service.findAllByProject.mockResolvedValue(tickets);

      const result = await controller.findAll(1);

      expect(service.findAllByProject).toHaveBeenCalledWith(1);
      expect(result).toBe(tickets);
    });
  });

  describe('findOne', () => {
    it('delegates to service with ticketId', async () => {
      const ticket = makeTicket({ id: 3 });
      service.findOne.mockResolvedValue(ticket);

      const result = await controller.findOne(3);

      expect(service.findOne).toHaveBeenCalledWith(3);
      expect(result).toBe(ticket);
    });
  });

  describe('create', () => {
    it('delegates to service with dto and user id', async () => {
      const ticket = makeTicket();
      service.create.mockResolvedValue(ticket);
      const dto = { title: 'T', projectId: 1, type: TicketType.TECHNICAL, priority: TicketPriority.MEDIUM };

      const result = await controller.create(dto as any, mockReq(2));

      expect(service.create).toHaveBeenCalledWith(dto, 2);
      expect(result).toBe(ticket);
    });
  });

  describe('update', () => {
    it('calls service update and returns void', async () => {
      service.update.mockResolvedValue(undefined);
      await controller.update(1, { title: 'Updated' });
      expect(service.update).toHaveBeenCalledWith(1, { title: 'Updated' });
    });
  });

  describe('softDelete', () => {
    it('delegates to service with ticketId and user id', async () => {
      service.softDelete.mockResolvedValue(undefined);

      await controller.softDelete(1, mockReq(3));

      expect(service.softDelete).toHaveBeenCalledWith(1, 3);
    });
  });

  describe('restore', () => {
    it('delegates to service', async () => {
      service.restore.mockResolvedValue(makeTicket());

      await controller.restore(1);

      expect(service.restore).toHaveBeenCalledWith(1);
    });
  });
});
