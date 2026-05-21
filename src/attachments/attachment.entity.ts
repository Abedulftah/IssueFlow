import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { Ticket } from '../tickets/ticket.entity';

@Entity('attachments')
export class Attachment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  filename: string;

  @Column()
  contentType: string;

  @Exclude()
  @Column({ type: 'int' })
  size: number;

  @Exclude()
  @Column()
  storagePath: string;

  @Column()
  ticketId: number;

  @Exclude()
  @ManyToOne(() => Ticket, { onDelete: 'CASCADE', eager: false })
  ticket: Ticket;

  @Exclude()
  @CreateDateColumn()
  createdAt: Date;
}
