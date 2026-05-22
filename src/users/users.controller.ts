import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { UsersService } from './users.service';
import { CommentsService } from '../comments/comments.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { MentionsQueryDto } from './dto/mentions-query.dto';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly commentsService: CommentsService,
  ) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':userId/mentions')
  getMentions(
    @Param('userId', ParseIntPipe) userId: number,
    @Query() query: MentionsQueryDto,
  ) {
    return this.commentsService.getMentionsForUser(userId, query.page, query.pageSize);
  }

  @Get(':userId')
  findOne(@Param('userId', ParseIntPipe) userId: number) {
    return this.usersService.findOne(userId);
  }

  @Public()
  @Post()
  @HttpCode(200)
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Post('update/:userId')
  @HttpCode(200)
  async update(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateUserDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.usersService.update(userId, dto, (req.user as any)?.id);
  }

  @Delete(':userId')
  remove(@Param('userId', ParseIntPipe) userId: number, @Req() req: Request) {
    return this.usersService.remove(userId, (req.user as any)?.id);
  }
}
