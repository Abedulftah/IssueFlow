import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';

const mockAttachmentsService = () => ({
  create: jest.fn(),
  remove: jest.fn(),
});

describe('AttachmentsController', () => {
  let controller: AttachmentsController;
  let service: ReturnType<typeof mockAttachmentsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AttachmentsController],
      providers: [{ provide: AttachmentsService, useFactory: mockAttachmentsService }],
    }).compile();

    controller = module.get(AttachmentsController);
    service = module.get(AttachmentsService);
  });

  describe('upload', () => {
    it('delegates to service and returns the saved attachment', async () => {
      const attachment = { id: 1, filename: 'test.png', ticketId: 10 };
      service.create.mockResolvedValue(attachment);
      const file = {
        originalname: 'test.png',
        mimetype: 'image/png',
        size: 1024,
        path: '/tmp/test.png',
      } as Express.Multer.File;

      const result = await controller.upload(10, file);

      expect(service.create).toHaveBeenCalledWith(10, file);
      expect(result).toBe(attachment);
    });

    it('throws 400 when no file is provided', async () => {
      await expect(
        controller.upload(10, undefined as any),
      ).rejects.toThrow(BadRequestException);
      expect(service.create).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('delegates to service.remove with just id', async () => {
      service.remove.mockResolvedValue(undefined);

      await controller.remove(5);

      expect(service.remove).toHaveBeenCalledWith(5);
    });
  });

  describe('removeForTicket', () => {
    it('delegates to service.remove with ticketId and id', async () => {
      service.remove.mockResolvedValue(undefined);

      await controller.removeForTicket(10, 5);

      expect(service.remove).toHaveBeenCalledWith(5, 10);
    });
  });
});
