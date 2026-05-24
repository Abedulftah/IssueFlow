import { BadRequestException, forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Not, Repository } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Project } from './project.entity';
import { Ticket } from '../tickets/ticket.entity';
import { Attachment } from '../attachments/attachment.entity';
import { Comment } from '../comments/comment.entity';
import { UsersService } from '../users/users.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { withCurrentUserTransaction } from '../database/current-user-transaction';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectsRepository: Repository<Project>,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(forwardRef(() => UsersService)) private readonly usersService: UsersService,
  ) {}

  async create(dto: CreateProjectDto): Promise<Project> {
    await this.usersService.findOne(dto.ownerId);
    const project = this.projectsRepository.create(dto);
    return withCurrentUserTransaction(this.dataSource, (manager) =>
      manager.getRepository(Project).save(project),
    );
  }

  findAll(): Promise<Project[]> {
    return this.projectsRepository.find();
  }

  async findOne(id: number): Promise<Project> {
    const project = await this.projectsRepository.findOne({ where: { id } });
    if (!project) throw new NotFoundException(`Project ${id} not found`);
    return project;
  }

  async findOneWithDeleted(id: number): Promise<Project | null> {
    return this.projectsRepository.findOne({ where: { id }, withDeleted: true });
  }

  async findDeleted(): Promise<Project[]> {
    return this.projectsRepository.find({
      withDeleted: true,
      where: { deletedAt: Not(IsNull()) },
    });
  }

  async update(id: number, dto: UpdateProjectDto): Promise<void> {
    const project = await this.findOne(id);
    if (dto.name !== undefined) project.name = dto.name;
    if (dto.description !== undefined) project.description = dto.description;
    await withCurrentUserTransaction(this.dataSource, async (manager) => {
      await manager.getRepository(Project).save(project);
    });
  }

  async softDelete(id: number): Promise<void> {
    await this.findOne(id); // throws 404 if not found or already soft-deleted
    const now = new Date();
    await withCurrentUserTransaction(this.dataSource, async (manager) => {
      const tickets = await manager.getRepository(Ticket).find({
        where: { projectId: id },
        select: ['id'],
      });
      const ticketIds = tickets.map((t) => t.id);
      if (ticketIds.length > 0) {
        await manager.getRepository(Attachment).softDelete({ ticketId: In(ticketIds) });
        await manager.getRepository(Comment).softDelete({ ticketId: In(ticketIds) });
        // Use explicit timestamp so cascade-deleted tickets share the project's deletedAt,
        // allowing restore() to distinguish them from independently-deleted tickets.
        await manager
          .createQueryBuilder()
          .update(Ticket)
          .set({ deletedAt: now })
          .where('projectId = :id AND "deletedAt" IS NULL', { id })
          .execute();
      }
      await manager
        .createQueryBuilder()
        .update(Project)
        .set({ deletedAt: now })
        .where('id = :id AND "deletedAt" IS NULL', { id })
        .execute();
    });
  }

  async restore(id: number): Promise<void> {
    const project = await this.projectsRepository.findOne({ where: { id }, withDeleted: true });
    if (!project) throw new NotFoundException(`Project ${id} not found`);
    if (!project.deletedAt) throw new BadRequestException('Project is not deleted');
    const projectDeletedAt = project.deletedAt;
    await withCurrentUserTransaction(this.dataSource, async (manager) => {
      await manager.getRepository(Project).restore(id);
      // Only restore tickets that were cascade-deleted with the project (same deletedAt timestamp).
      // Tickets independently soft-deleted before the project deletion keep their deleted state.
      const cascadedTickets = await manager.getRepository(Ticket).find({
        where: { projectId: id, deletedAt: projectDeletedAt },
        withDeleted: true,
        select: ['id'],
      });
      const ticketIds = cascadedTickets.map((t) => t.id);
      if (ticketIds.length > 0) {
        await manager.getRepository(Ticket).restore(ticketIds);
        await manager.getRepository(Attachment).restore({ ticketId: In(ticketIds) });
        await manager.getRepository(Comment).restore({ ticketId: In(ticketIds) });
      }
    });
  }
}
