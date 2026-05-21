import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket } from '../tickets/ticket.entity';
import { DependenciesController } from './dependencies.controller';
import { DependenciesService } from './dependencies.service';

@Module({
  imports: [TypeOrmModule.forFeature([Ticket])],
  controllers: [DependenciesController],
  providers: [DependenciesService],
})
export class DependenciesModule {}
