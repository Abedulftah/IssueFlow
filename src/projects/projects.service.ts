import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { Project } from './project.entity';
import { UsersService } from '../users/users.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectsRepository: Repository<Project>,
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

  async update(id: number, dto: UpdateProjectDto): Promise<void> {
    const project = await this.findOne(id);
    if (dto.name !== undefined) project.name = dto.name;
    if (dto.description !== undefined) project.description = dto.description;
    await this.projectsRepository.save(project);
  }

  async softDelete(id: number): Promise<void> {
    await this.findOne(id); // throws 404 if not found or already soft-deleted
    await this.projectsRepository.softDelete(id);
  }

  async restore(id: number): Promise<void> {
    const project = await this.projectsRepository.findOne({ where: { id }, withDeleted: true });
    if (!project) throw new NotFoundException(`Project ${id} not found`);
    if (!project.deletedAt) throw new BadRequestException('Project is not deleted');
    await this.projectsRepository.restore(id);
  }
}
