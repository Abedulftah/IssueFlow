import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DependenciesService } from './dependencies.service';
import { CreateDependencyDto } from './dto/create-dependency.dto';

@UseGuards(JwtAuthGuard)
@Controller('tickets')
export class DependenciesController {
  constructor(private readonly dependenciesService: DependenciesService) {}

  @Get(':id/dependencies')
  async getDependencies(@Param('id', ParseIntPipe) id: number) {
    const blockers = await this.dependenciesService.getDependencies(id);
    return blockers.map(({ id: blockerId, title, status }) => ({ id: blockerId, title, status }));
  }

  @Post(':id/dependencies')
  @HttpCode(200)
  addDependency(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateDependencyDto,
  ) {
    return this.dependenciesService.addDependency(id, dto.blockedBy);
  }

  @Delete(':id/dependencies/:blockerId')
  removeDependency(
    @Param('id', ParseIntPipe) id: number,
    @Param('blockerId', ParseIntPipe) blockerId: number,
  ) {
    return this.dependenciesService.removeDependency(id, blockerId);
  }
}
