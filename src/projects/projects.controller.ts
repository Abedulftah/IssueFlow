import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user.entity';
import { ProjectsService } from './projects.service';
import { TicketsService } from '../tickets/tickets.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly ticketsService: TicketsService,
  ) {}

  @Get()
  findAll() {
    return this.projectsService.findAll();
  }

  // Must be declared before :projectId to prevent "deleted" being matched as an ID
  @Get('deleted')
  @Roles(UserRole.ADMIN)
  findDeleted() {
    return this.projectsService.findDeleted();
  }

  @Get(':projectId/workload')
  async getWorkload(@Param('projectId', ParseIntPipe) projectId: number) {
    await this.projectsService.findOne(projectId); // throws 404 if not found
    return this.ticketsService.getProjectWorkload(projectId);
  }

  @Get(':projectId')
  findOne(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.projectsService.findOne(projectId);
  }

  @Post()
  @HttpCode(200)
  create(@Body() dto: CreateProjectDto) {
    return this.projectsService.create(dto);
  }

  @Patch(':projectId')
  async update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: UpdateProjectDto,
    @Req() req: any,
  ): Promise<void> {
    const project = await this.projectsService.findOne(projectId);
    if (req.user.role !== UserRole.ADMIN && req.user.id !== project.ownerId) {
      throw new ForbiddenException();
    }
    await this.projectsService.update(projectId, dto);
  }

  @Delete(':projectId')
  @Roles(UserRole.ADMIN)
  softDelete(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.projectsService.softDelete(projectId);
  }

  @Post(':projectId/restore')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  restore(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.projectsService.restore(projectId);
  }
}
