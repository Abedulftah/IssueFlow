import { Test, TestingModule } from '@nestjs/testing';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';

const mockCommentsService = () => ({
  findAllByTicket: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
});

describe('CommentsController', () => {
  let controller: CommentsController;
  let service: ReturnType<typeof mockCommentsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommentsController],
      providers: [{ provide: CommentsService, useFactory: mockCommentsService }],
    }).compile();

    controller = module.get(CommentsController);
    service = module.get(CommentsService);
  });

  describe('findAll', () => {
    it('delegates to service with ticketId', async () => {
      const comments = [{ id: 1, content: 'Hi' }];
      service.findAllByTicket.mockResolvedValue(comments);

      const result = await controller.findAll(10);

      expect(service.findAllByTicket).toHaveBeenCalledWith(10);
      expect(result).toBe(comments);
    });
  });

  describe('create', () => {
    it('delegates to service with ticketId and dto', async () => {
      const comment = { id: 1, content: 'Hello' };
      service.create.mockResolvedValue(comment);
      const dto = { content: 'Hello', authorId: 1 };

      const result = await controller.create(10, dto as any);

      expect(service.create).toHaveBeenCalledWith(10, dto);
      expect(result).toBe(comment);
    });
  });

  describe('update', () => {
    it('calls service.update and returns void', async () => {
      service.update.mockResolvedValue(undefined);
      await controller.update(10, 5, { content: 'Updated' });
      expect(service.update).toHaveBeenCalledWith(10, 5, { content: 'Updated' });
    });
  });

  describe('remove', () => {
    it('delegates to service with ticketId and commentId', async () => {
      service.remove.mockResolvedValue(undefined);

      await controller.remove(10, 5);

      expect(service.remove).toHaveBeenCalledWith(10, 5);
    });
  });
});
