import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { ExportTicketsQueryDto } from './dto/export-tickets-query.dto';
import { ImportTicketsDto } from './dto/import-tickets.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user.entity';

const ALLOWED_CSV_MIME = new Set(['text/csv', 'text/plain']);

const csvMulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (
    _req: any,
    file: Express.Multer.File,
    cb: (err: Error | null, accept: boolean) => void,
  ) => {
    if (ALLOWED_CSV_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BadRequestException(`File type '${file.mimetype}' is not allowed`), false);
    }
  },
};

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get('export')
  async exportCsv(
    @Query() query: ExportTicketsQueryDto,
    @Res({ passthrough: false }) res: Response,
  ) {
    const csv = await this.ticketsService.exportToCsv(query.projectId);
    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="tickets.csv"',
    });
    res.send(csv);
  }

  @Post('import')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', csvMulterOptions))
  async importCsv(
    @Body() dto: ImportTicketsDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    return this.ticketsService.importFromCsv(dto.projectId, file.buffer);
  }

  // Must be declared before :ticketId to prevent "deleted" being matched as an ID
  @Get('deleted')
  @Roles(UserRole.ADMIN)
  async findDeleted(@Query('projectId') projectId?: string) {
    const pid = projectId !== undefined ? parseInt(projectId, 10) : undefined;
    return this.ticketsService.findDeleted(isNaN(pid) ? undefined : pid);
  }

  @Get()
  findAll(@Query('projectId', ParseIntPipe) projectId: number) {
    return this.ticketsService.findAllByProject(projectId);
  }

  @Get(':ticketId')
  findOne(@Param('ticketId', ParseIntPipe) ticketId: number) {
    return this.ticketsService.findOne(ticketId);
  }

  @Post()
  @HttpCode(200)
  create(@Body() dto: CreateTicketDto) {
    return this.ticketsService.create(dto);
  }

  @Patch(':ticketId')
  async update(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() dto: UpdateTicketDto,
  ): Promise<void> {
    await this.ticketsService.update(ticketId, dto);
  }

  @Delete(':ticketId')
  softDelete(@Param('ticketId', ParseIntPipe) ticketId: number) {
    return this.ticketsService.softDelete(ticketId);
  }

  @Post(':ticketId/restore')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  restore(@Param('ticketId', ParseIntPipe) ticketId: number) {
    return this.ticketsService.restore(ticketId);
  }
}
