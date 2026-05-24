import * as fs from 'fs';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Attachment } from './attachment.entity';
import { TicketsService } from '../tickets/tickets.service';
import { InjectDataSource } from '@nestjs/typeorm';
import { withCurrentUserTransaction } from '../database/current-user-transaction';

const UPLOAD_DIR = './uploads/attachments';

@Injectable()
export class AttachmentsService {
  constructor(
    @InjectRepository(Attachment)
    private readonly attachmentRepo: Repository<Attachment>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly ticketsService: TicketsService,
  ) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  async create(
    ticketId: number,
    file: Express.Multer.File,
  ): Promise<Attachment> {
    try {
      await this.ticketsService.findOne(ticketId);

      const attachment = this.attachmentRepo.create({
        filename: file.originalname,
        contentType: file.mimetype,
        size: file.size,
        storagePath: file.path,
        ticketId,
      });

      return await withCurrentUserTransaction(this.dataSource, (manager) =>
        manager.getRepository(Attachment).save(attachment),
      );
    } catch (err) {
      try {
        fs.unlinkSync(file.path);
      } catch {
        // ignore cleanup errors
      }
      throw err;
    }
  }

  async remove(id: number, ticketId?: number): Promise<void> {
    const where = ticketId === undefined ? { id } : { id, ticketId };
    const attachment = await this.attachmentRepo.findOne({ where });
    if (!attachment) {
      throw new NotFoundException(`Attachment ${id} not found`);
    }

    await withCurrentUserTransaction(this.dataSource, async (manager) => {
      await manager.getRepository(Attachment).delete(id);
      try {
        fs.unlinkSync(attachment.storagePath);
      } catch (err: any) {
        if (err.code !== 'ENOENT') throw err;
      }
    });
  }
}
