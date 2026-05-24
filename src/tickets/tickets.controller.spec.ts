import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
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

});

