import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, OptimisticLockVersionMismatchError } from 'typeorm';
import { CommentsService } from './comments.service';
import { Comment } from './comment.entity';
import { CommentMention } from './comment-mention.entity';
import { TicketsService } from '../tickets/tickets.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { UserRole } from '../users/user.entity';

const AUTHOR_ID = 2;
const OTHER_ID = 99;
const ADMIN_ROLE = UserRole.ADMIN;
const USER_ROLE = 'USER' as UserRole;

const alice = { id: 10, username: 'alice', fullName: 'Alice A', email: 'alice@test.com' };
const bob = { id: 11, username: 'bob', fullName: 'Bob B', email: 'bob@test.com' };

const mockComment = (overrides: Partial<Comment> = {}): Comment =>
  ({
    id: 1,
    ticketId: 1,
    authorId: 2,
    content: 'Test comment',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ticket: null,
    author: null,
    mentions: [],
    mentionedUsers: [],
    ...overrides,
  } as Comment);

describe('CommentsService', () => {
  let service: CommentsService;
  let repo: { find: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock; remove: jest.Mock };
  let mentionRepo: { find: jest.Mock; findAndCount: jest.Mock; save: jest.Mock; remove: jest.Mock; create: jest.Mock };
  let ticketsService: { findOne: jest.Mock };
  let usersService: { findOne: jest.Mock; findByUsernames: jest.Mock };
  let mailService: { sendMentionNotification: jest.Mock };

  beforeEach(async () => {
    repo = { find: jest.fn(), findOne: jest.fn(), create: jest.fn(), save: jest.fn(), remove: jest.fn() };
    mentionRepo = { find: jest.fn(), findAndCount: jest.fn(), save: jest.fn(), remove: jest.fn(), create: jest.fn() };
    ticketsService = { findOne: jest.fn().mockResolvedValue({ id: 1 }) };
    usersService = {
      findOne: jest.fn().mockResolvedValue({ id: 2 }),
      findByUsernames: jest.fn().mockResolvedValue([]),
    };
    mailService = { sendMentionNotification: jest.fn().mockResolvedValue(undefined) };
    const dataSource = {
      transaction: jest.fn(async (cb: (manager: unknown) => unknown) =>
        cb({
          query: jest.fn().mockResolvedValue(undefined),
          getRepository: (entity: unknown) => {
            if (entity === Comment) return repo;
            if (entity === CommentMention) return mentionRepo;
            return repo;
          },
        }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: getRepositoryToken(Comment), useValue: repo },
        { provide: getRepositoryToken(CommentMention), useValue: mentionRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: TicketsService, useValue: ticketsService },
        { provide: UsersService, useValue: usersService },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();

    service = module.get(CommentsService);
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a comment with no mentions', async () => {
      const comment = mockComment();
      repo.create.mockReturnValue(comment);
      repo.save.mockResolvedValue(comment);

      const result = await service.create(1, { content: 'Hello world' }, 2);
      expect(result.mentionedUsers).toEqual([]);
      expect(mentionRepo.save).not.toHaveBeenCalled();
      expect(mailService.sendMentionNotification).not.toHaveBeenCalled();
    });

    it('creates mention rows and dispatches emails for valid @mentions', async () => {
      usersService.findByUsernames.mockResolvedValue([alice]);
      mentionRepo.create.mockImplementation((v) => v);
      mentionRepo.save.mockResolvedValue([]);

      const comment = mockComment();
      repo.create.mockReturnValue(comment);
      repo.save.mockResolvedValue({ ...comment, id: 1 });

      const result = await service.create(1, { content: 'Hey @alice!' }, 2);
      expect(mentionRepo.save).toHaveBeenCalled();
      expect(result.mentionedUsers).toEqual([
        { id: alice.id, username: alice.username, fullName: alice.fullName },
      ]);
    });

    it('throws BadRequestException for unknown @mention username', async () => {
      usersService.findByUsernames.mockResolvedValue([]);

      await expect(
        service.create(1, { content: 'Hey @ghost!' }, 2),
      ).rejects.toThrow(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when ticket does not exist', async () => {
      ticketsService.findOne.mockRejectedValue(new NotFoundException());
      await expect(service.create(999, { content: 'x' }, 2)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when authorId does not exist', async () => {
      usersService.findOne.mockRejectedValue(new NotFoundException());
      await expect(service.create(1, { content: 'x' }, 999999)).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('adds new mention and emails only new user', async () => {
      const existingMention = { id: 99, commentId: 1, userId: alice.id };
      repo.findOne.mockResolvedValue(mockComment({ content: '@alice old' }));
      repo.save.mockResolvedValue(mockComment({ content: '@alice @bob' }));
      usersService.findByUsernames.mockResolvedValue([alice, bob]);
      mentionRepo.find.mockResolvedValue([existingMention]);
      mentionRepo.create.mockImplementation((v) => v);
      mentionRepo.save.mockResolvedValue([]);

      const result = await service.update(1, 1, { content: '@alice @bob' }, AUTHOR_ID, USER_ROLE);

      // Only bob is new → only bob's mention inserted
      expect(mentionRepo.save).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ userId: bob.id })]),
      );
      expect(mentionRepo.remove).not.toHaveBeenCalled();
      expect(result.mentionedUsers).toHaveLength(2);
    });

    it('removes stale mention and does not email removed user', async () => {
      const existingMention = { id: 99, commentId: 1, userId: alice.id };
      repo.findOne.mockResolvedValue(mockComment({ content: '@alice' }));
      repo.save.mockResolvedValue(mockComment({ content: 'no mentions' }));
      usersService.findByUsernames.mockResolvedValue([]);
      mentionRepo.find.mockResolvedValue([existingMention]);

      await service.update(1, 1, { content: 'no mentions' }, AUTHOR_ID, USER_ROLE);

      expect(mentionRepo.remove).toHaveBeenCalledWith([existingMention]);
      expect(mailService.sendMentionNotification).not.toHaveBeenCalled();
    });

    it('SMTP error in dispatchMentionEmails does not propagate', async () => {
      mailService.sendMentionNotification.mockRejectedValue(new Error('SMTP down'));
      usersService.findByUsernames.mockResolvedValue([alice]);
      mentionRepo.find.mockResolvedValue([]);
      mentionRepo.create.mockImplementation((v) => v);
      mentionRepo.save.mockResolvedValue([]);
      repo.findOne.mockResolvedValue(mockComment());
      repo.save.mockResolvedValue(mockComment());

      await expect(
        service.update(1, 1, { content: '@alice' }, AUTHOR_ID, USER_ROLE),
      ).resolves.not.toThrow();
    });

    it('throws ConflictException when client version is stale', async () => {
      repo.findOne.mockResolvedValue(mockComment({ version: 3 }));
      usersService.findByUsernames.mockResolvedValue([]);

      await expect(service.update(1, 1, { content: 'x', version: 2 }, AUTHOR_ID, USER_ROLE)).rejects.toThrow(ConflictException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('proceeds when client version matches db version', async () => {
      repo.findOne.mockResolvedValue(mockComment({ version: 3 }));
      repo.save.mockResolvedValue(mockComment({ version: 4 }));
      usersService.findByUsernames.mockResolvedValue([]);
      mentionRepo.find.mockResolvedValue([]);

      await expect(service.update(1, 1, { content: 'x', version: 3 }, AUTHOR_ID, USER_ROLE)).resolves.toBeDefined();
    });

    it('skips version check when version is omitted', async () => {
      repo.findOne.mockResolvedValue(mockComment({ version: 5 }));
      repo.save.mockResolvedValue(mockComment({ version: 6 }));
      usersService.findByUsernames.mockResolvedValue([]);
      mentionRepo.find.mockResolvedValue([]);

      await expect(service.update(1, 1, { content: 'x' }, AUTHOR_ID, USER_ROLE)).resolves.toBeDefined();
    });

    it('throws ConflictException on optimistic lock error from DB', async () => {
      repo.findOne.mockResolvedValue(mockComment());
      usersService.findByUsernames.mockResolvedValue([]);
      mentionRepo.find.mockResolvedValue([]);
      repo.save.mockRejectedValue(new OptimisticLockVersionMismatchError('Comment', 1, 0));

      await expect(service.update(1, 1, { content: 'x' }, AUTHOR_ID, USER_ROLE)).rejects.toThrow(ConflictException);
    });

    it('rethrows non-optimistic-lock errors from save', async () => {
      repo.findOne.mockResolvedValue(mockComment());
      usersService.findByUsernames.mockResolvedValue([]);
      mentionRepo.find.mockResolvedValue([]);
      const genericError = new Error('Unexpected DB error');
      repo.save.mockRejectedValue(genericError);

      await expect(service.update(1, 1, { content: 'x' }, AUTHOR_ID, USER_ROLE)).rejects.toThrow(genericError);
    });

    it('throws NotFoundException when comment does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.update(1, 999, { content: 'x' }, AUTHOR_ID, USER_ROLE)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when non-author non-admin tries to edit', async () => {
      repo.findOne.mockResolvedValue(mockComment());
      await expect(service.update(1, 1, { content: 'x' }, OTHER_ID, USER_ROLE)).rejects.toThrow(ForbiddenException);
    });

    it('allows admin to edit any comment', async () => {
      repo.findOne.mockResolvedValue(mockComment());
      repo.save.mockResolvedValue(mockComment({ content: 'x' }));
      usersService.findByUsernames.mockResolvedValue([]);
      mentionRepo.find.mockResolvedValue([]);
      await expect(service.update(1, 1, { content: 'x' }, OTHER_ID, ADMIN_ROLE)).resolves.toBeDefined();
    });
  });

  // ── remove ────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('removes the comment when it exists', async () => {
      repo.findOne.mockResolvedValue(mockComment());
      repo.remove.mockResolvedValue(undefined);
      await expect(service.remove(1, 1, AUTHOR_ID, USER_ROLE)).resolves.toBeUndefined();
    });

    it('throws NotFoundException when comment does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.remove(1, 999, AUTHOR_ID, USER_ROLE)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when non-author non-admin tries to delete', async () => {
      repo.findOne.mockResolvedValue(mockComment());
      await expect(service.remove(1, 1, OTHER_ID, USER_ROLE)).rejects.toThrow(ForbiddenException);
    });

    it('allows admin to delete any comment', async () => {
      repo.findOne.mockResolvedValue(mockComment());
      repo.remove.mockResolvedValue(undefined);
      await expect(service.remove(1, 1, OTHER_ID, ADMIN_ROLE)).resolves.toBeUndefined();
    });
  });

  // ── getMentionsForUser ────────────────────────────────────────────────────

  describe('getMentionsForUser', () => {
    it('returns paginated mentions for a valid user', async () => {
      const comment = mockComment({
        mentions: [{ id: 1, commentId: 1, userId: alice.id, user: alice as any, comment: null }],
      });
      mentionRepo.findAndCount.mockResolvedValue([[{ comment, userId: alice.id }], 1]);

      const result = await service.getMentionsForUser(alice.id, 1, 10);

      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.data).toHaveLength(1);
    });

    it('throws NotFoundException when user does not exist', async () => {
      usersService.findOne.mockRejectedValue(new NotFoundException());
      await expect(service.getMentionsForUser(999, 1, 10)).rejects.toThrow(NotFoundException);
    });
  });

  // ── findAllByTicket ───────────────────────────────────────────────────────

  describe('findAllByTicket', () => {
    it('returns comments with mentionedUsers populated', async () => {
      const comment = mockComment({
        mentions: [{ id: 1, commentId: 1, userId: alice.id, user: alice as any, comment: null }],
      });
      repo.find.mockResolvedValue([comment]);

      const result = await service.findAllByTicket(1);
      expect(result[0].mentionedUsers).toEqual([
        { id: alice.id, username: alice.username, fullName: alice.fullName },
      ]);
    });

    it('throws NotFoundException when ticket does not exist', async () => {
      ticketsService.findOne.mockRejectedValue(new NotFoundException());
      await expect(service.findAllByTicket(999)).rejects.toThrow(NotFoundException);
    });
  });
});
