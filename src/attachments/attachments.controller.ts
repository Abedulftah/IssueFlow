import {
  BadRequestException,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { MulterError } from 'multer';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { AttachmentsService } from './attachments.service';
import { MulterExceptionFilter } from './multer-exception.filter';

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'application/pdf',
  'text/plain',
]);

const multerOptions = {
  storage: diskStorage({
    destination: './uploads/attachments',
    filename: (_req, file, cb) => {
      const safeName = path.basename(file.originalname).replace(/\s+/g, '_');
      cb(null, `${randomUUID()}-${safeName}`);
    },
  }),
  limits: { fileSize: 10_485_760 },
  fileFilter: (
    _req: any,
    file: Express.Multer.File,
    cb: (err: Error | null, accept: boolean) => void,
  ) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BadRequestException(`File type '${file.mimetype}' is not allowed. Allowed types: image/png, image/jpeg, application/pdf, text/plain`), false);
    }
  },
};

@Controller()
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  // No request body DTO — file arrives via multipart/form-data as Express.Multer.File
  @Post('tickets/:ticketId/attachments')
  @HttpCode(200)
  @UseFilters(MulterExceptionFilter)
  @UseInterceptors(FileInterceptor('file', multerOptions))
  async upload(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    try {
      return await this.attachmentsService.create(ticketId, file);
    } catch (err) {
      if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
        throw new BadRequestException('File too large. Maximum size is 10 MB');
      }
      throw err;
    }
  }

  @Delete('attachments/:id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.attachmentsService.remove(id);
  }

  @Delete('tickets/:ticketId/attachments/:id')
  async removeForTicket(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.attachmentsService.remove(id, ticketId);
  }
}
