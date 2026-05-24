import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { UserRole } from '../users/user.entity';

@UseGuards(JwtAuthGuard)
@Controller('tickets/:ticketId/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get()
  findAll(@Param('ticketId', ParseIntPipe) ticketId: number) {
    return this.commentsService.findAllByTicket(ticketId);
  }

  @Post()
  @HttpCode(200)
  create(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() dto: CreateCommentDto,
    @Req() req: Request,
  ) {
    return this.commentsService.create(ticketId, dto, (req.user as any).id);
  }

  @Patch(':commentId')
  async update(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Param('commentId', ParseIntPipe) commentId: number,
    @Body() dto: UpdateCommentDto,
    @Req() req: Request,
  ): Promise<void> {
    const caller = req.user as any;
    await this.commentsService.update(ticketId, commentId, dto, caller.id, caller.role as UserRole);
  }

  @Delete(':commentId')
  remove(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Param('commentId', ParseIntPipe) commentId: number,
    @Req() req: Request,
  ) {
    const caller = req.user as any;
    return this.commentsService.remove(ticketId, commentId, caller.id, caller.role as UserRole);
  }
}
