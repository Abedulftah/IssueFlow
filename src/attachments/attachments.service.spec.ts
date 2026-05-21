import * as fs from 'fs';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AttachmentsService } from './attachments.service';
import { Attachment } from './attachment.entity';
import { TicketsService } from '../tickets/tickets.service';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  mkdirSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

const mockRepo = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  delete: jest.fn(),
});

const mockTicketsService = () => ({
  findOne: jest.fn(),
});

const makeFile = (): Express.Multer.File =>
  ({
    originalname: 'test.png',
    mimetype: 'image/png',
    size: 512,
    path: '/uploads/attachments/uuid-test.png',
    buffer: Buffer.alloc(0),
  } as Express.Multer.File);

describe('AttachmentsService', () => {
  let service: AttachmentsService;
  let repo: ReturnType<typeof mockRepo>;
  let ticketsService: ReturnType<typeof mockTicketsService>;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentsService,
        { provide: getRepositoryToken(Attachment), useFactory: mockRepo },
        { provide: TicketsService, useFactory: mockTicketsService },
      ],
    }).compile();

    service = module.get(AttachmentsService);
    repo = module.get(getRepositoryToken(Attachment));
    ticketsService = module.get(TicketsService);
  });

  describe('create', () => {
    it('verifies ticket exists, persists attachment, and returns it', async () => {
      const ticket = { id: 1 };
      ticketsService.findOne.mockResolvedValue(ticket);
      const attachment = { id: 10, filename: 'test.png', ticketId: 1 };
      repo.create.mockReturnValue(attachment);
      repo.save.mockResolvedValue(attachment);

      const result = await service.create(1, makeFile());

      expect(ticketsService.findOne).toHaveBeenCalledWith(1);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ filename: 'test.png', ticketId: 1 }),
      );
      expect(result).toBe(attachment);
    });

    it('cleans up the uploaded file and re-throws when save fails', async () => {
      ticketsService.findOne.mockResolvedValue({ id: 1 });
      const attachment = { id: null, storagePath: '/uploads/attachments/uuid-test.png' };
      repo.create.mockReturnValue(attachment);
      const dbError = new Error('DB error');
      repo.save.mockRejectedValue(dbError);
      const file = makeFile();

      await expect(service.create(1, file)).rejects.toThrow(dbError);
      expect(fs.unlinkSync).toHaveBeenCalledWith(file.path);
    });
  });

  describe('remove', () => {
    it('deletes the file from disk and the record from DB', async () => {
      const attachment = { id: 5, storagePath: '/uploads/attachments/file.png', ticketId: 1 };
      repo.findOne.mockResolvedValue(attachment);
      repo.delete.mockResolvedValue(undefined);

      await service.remove(5);

      expect(fs.unlinkSync).toHaveBeenCalledWith(attachment.storagePath);
      expect(repo.delete).toHaveBeenCalledWith(5);
    });

    it('throws 404 when attachment does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });

    it('ignores ENOENT errors when deleting the file', async () => {
      const attachment = { id: 5, storagePath: '/missing.png', ticketId: 1 };
      repo.findOne.mockResolvedValue(attachment);
      repo.delete.mockResolvedValue(undefined);
      (fs.unlinkSync as jest.Mock).mockImplementation(() => {
        const err: any = new Error('ENOENT');
        err.code = 'ENOENT';
        throw err;
      });

      await expect(service.remove(5)).resolves.toBeUndefined();
      expect(repo.delete).toHaveBeenCalledWith(5);
    });

    it('re-throws non-ENOENT file errors', async () => {
      const attachment = { id: 5, storagePath: '/locked.png', ticketId: 1 };
      repo.findOne.mockResolvedValue(attachment);
      (fs.unlinkSync as jest.Mock).mockImplementation(() => {
        const err: any = new Error('EPERM');
        err.code = 'EPERM';
        throw err;
      });

      await expect(service.remove(5)).rejects.toThrow('EPERM');
    });

    it('filters by ticketId when provided', async () => {
      const attachment = { id: 5, storagePath: '/f.png', ticketId: 1 };
      repo.findOne.mockResolvedValue(attachment);
      repo.delete.mockResolvedValue(undefined);

      await service.remove(5, 1);

      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 5, ticketId: 1 } });
    });
  });
});
