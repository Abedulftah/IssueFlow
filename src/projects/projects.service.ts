import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Not, Repository } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Project } from './project.entity';
import { UsersService } from '../users/users.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectsRepository: Repository<Project>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly usersService: UsersService,
  ) {}

  async create(dto: CreateProjectDto): Promise<Project> {
    await this.usersService.findOne(dto.ownerId);
    const project = this.projectsRepository.create(dto);
    return this.projectsRepository.save(project);
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

  async update(id: number, dto: UpdateProjectDto, userId?: number): Promise<void> {
    const project = await this.findOne(id);
    if (dto.name !== undefined) project.name = dto.name;
    if (dto.description !== undefined) project.description = dto.description;
    await this.dataSource.transaction(async (manager) => {
      if (userId !== undefined) {
        await manager.query(`SET LOCAL issueflow.current_user_id = '${Number(userId)}'`);
      }
      await manager.getRepository(Project).save(project);
    });
  }

  async softDelete(id: number, userId?: number): Promise<void> {
    await this.findOne(id); // throws 404 if not found or already soft-deleted
    await this.dataSource.transaction(async (manager) => {
      if (userId !== undefined) {
        await manager.query(`SET LOCAL issueflow.current_user_id = '${Number(userId)}'`);
      }
      await manager.getRepository(Project).softDelete(id);
    });
  }

  async restore(id: number, userId?: number): Promise<void> {
    const project = await this.projectsRepository.findOne({ where: { id }, withDeleted: true });
    if (!project) throw new NotFoundException(`Project ${id} not found`);
    if (!project.deletedAt) throw new BadRequestException('Project is not deleted');
    await this.dataSource.transaction(async (manager) => {
      if (userId !== undefined) {
        await manager.query(`SET LOCAL issueflow.current_user_id = '${Number(userId)}'`);
      }
      await manager.getRepository(Project).restore(id);
    });
  }
}
