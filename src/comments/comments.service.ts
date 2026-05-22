import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OptimisticLockVersionMismatchError, Repository } from 'typeorm';
import { Comment } from './comment.entity';
import { CommentMention } from './comment-mention.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { TicketsService } from '../tickets/tickets.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { User } from '../users/user.entity';
import { extractMentions } from './mentions.util';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { withCurrentUserTransaction } from '../database/current-user-transaction';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentsRepository: Repository<Comment>,
    @InjectRepository(CommentMention)
    private readonly mentionRepository: Repository<CommentMention>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly ticketsService: TicketsService,
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
  ) {}

  async findAllByTicket(ticketId: number): Promise<Comment[]> {
    await this.ticketsService.findOne(ticketId);
    const comments = await this.commentsRepository.find({
      where: { ticketId },
      relations: ['mentions', 'mentions.user'],
    });
    return comments.map(this.populateMentionedUsers);
  }

  async create(ticketId: number, dto: CreateCommentDto): Promise<Comment> {
    await this.ticketsService.findOne(ticketId);
    await this.usersService.findOne(dto.authorId);

    const usernames = extractMentions(dto.content);
    const mentionedUsers = await this.resolveMentions(usernames);
    let newlyAddedMentions: User[] = [];

    const comment = this.commentsRepository.create({
      ticketId,
      authorId: dto.authorId,
      content: dto.content,
    });
    const saved = await withCurrentUserTransaction(this.dataSource, async (manager) => {
      const savedComment = await manager.getRepository(Comment).save(comment);

      if (mentionedUsers.length) {
        await manager.getRepository(CommentMention).save(
          mentionedUsers.map((u) =>
            manager.getRepository(CommentMention).create({
              commentId: savedComment.id,
              userId: u.id,
            }),
          ),
        );
      }

      return savedComment;
    });

    saved.mentionedUsers = mentionedUsers.map((u) => ({
      id: u.id,
      username: u.username,
      fullName: u.fullName,
    }));

    this.dispatchMentionEmails(mentionedUsers, dto.authorId, ticketId, dto.content);

    return saved;
  }

  async update(
    ticketId: number,
    commentId: number,
    dto: UpdateCommentDto,
  ): Promise<Comment> {
    await this.ticketsService.findOne(ticketId);
    const comment = await this.findComment(ticketId, commentId);

    if (dto.version !== undefined && comment.version !== dto.version) {
      throw new ConflictException('Comment was modified by another request');
    }

    const usernames = extractMentions(dto.content);
    const mentionedUsers = await this.resolveMentions(usernames);
    let newlyAddedMentions: User[] = [];

    comment.content = dto.content;
    let saved: Comment;
    try {
      saved = await withCurrentUserTransaction(this.dataSource, async (manager) => {
        const savedComment = await manager.getRepository(Comment).save(comment);

        const existing = await manager.getRepository(CommentMention).find({
          where: { commentId },
        });
        const existingUserIds = new Set(existing.map((m) => m.userId));
        const newUserIds = new Set(mentionedUsers.map((u) => u.id));

        const toAdd = mentionedUsers.filter((u) => !existingUserIds.has(u.id));
        const toRemove = existing.filter((m) => !newUserIds.has(m.userId));
        newlyAddedMentions = toAdd;

        if (toAdd.length) {
          await manager.getRepository(CommentMention).save(
            toAdd.map((u) =>
              manager.getRepository(CommentMention).create({
                commentId,
                userId: u.id,
              }),
            ),
          );
        }
        if (toRemove.length) {
          await manager.getRepository(CommentMention).remove(toRemove);
        }

        return savedComment;
      });
    } catch (err) {
      if (err instanceof OptimisticLockVersionMismatchError) {
        throw new ConflictException('Comment was modified by another request');
      }
      throw err;
    }

    saved.mentionedUsers = mentionedUsers.map((u) => ({
      id: u.id,
      username: u.username,
      fullName: u.fullName,
    }));

    if (newlyAddedMentions.length) {
      this.dispatchMentionEmails(newlyAddedMentions, comment.authorId, ticketId, dto.content);
    }

    return saved;
  }

  async remove(ticketId: number, commentId: number): Promise<void> {
    await this.ticketsService.findOne(ticketId);
    const comment = await this.findComment(ticketId, commentId);
    await withCurrentUserTransaction(this.dataSource, async (manager) => {
      await manager.getRepository(Comment).remove(comment);
    });
  }

  async getMentionsForUser(
    userId: number,
    page: number,
    pageSize: number,
  ): Promise<{ data: Comment[]; total: number; page: number }> {
    await this.usersService.findOne(userId);

    const [mentions, total] = await this.mentionRepository.findAndCount({
      where: { userId },
      relations: ['comment', 'comment.mentions', 'comment.mentions.user'],
      order: { comment: { createdAt: 'DESC' } } as any,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const data = mentions.map((m) => this.populateMentionedUsers(m.comment));
    return { data, total, page };
  }

  private async resolveMentions(usernames: string[]): Promise<User[]> {
    if (!usernames.length) return [];
    const users = await this.usersService.findByUsernames(usernames);
    if (users.length !== usernames.length) {
      const found = new Set(users.map((u) => u.username.toLowerCase()));
      const missing = usernames.filter((n) => !found.has(n));
      throw new BadRequestException(
        `Unknown username(s) in mentions: ${missing.join(', ')}`,
      );
    }
    return users;
  }

  private populateMentionedUsers(comment: Comment): Comment {
    comment.mentionedUsers = (comment.mentions ?? []).map((m) => ({
      id: m.user.id,
      username: m.user.username,
      fullName: m.user.fullName,
    }));
    return comment;
  }

  private dispatchMentionEmails(
    users: User[],
    authorId: number,
    ticketId: number,
    content: string,
  ): void {
    Promise.all(
      users
        .filter((u) => u.email)
        .map((u) =>
          this.mailService.sendMentionNotification(
            u.email,
            `user #${authorId}`,
            ticketId,
            content,
          ),
        ),
    ).catch(() => {});
  }

  private async findComment(
    ticketId: number,
    commentId: number,
  ): Promise<Comment> {
    const comment = await this.commentsRepository.findOne({
      where: { id: commentId, ticketId },
    });
    if (!comment) throw new NotFoundException(`Comment ${commentId} not found`);
    return comment;
  }
}
