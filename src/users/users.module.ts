import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AdminSeedService } from './admin-seed.service';
import { CommentsModule } from '../comments/comments.module';
import { TicketsModule } from '../tickets/tickets.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    forwardRef(() => CommentsModule),
    forwardRef(() => TicketsModule),
  ],
  controllers: [UsersController],
  providers: [UsersService, AdminSeedService],
  exports: [UsersService],
})
export class UsersModule {}
