import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { Ticket } from '../tickets/ticket.entity';
import { User } from '../users/user.entity';
import { CommentMention } from './comment-mention.entity';

@Entity('comments')
export class Comment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  ticketId: number;

  @Exclude()
  @ManyToOne(() => Ticket, { nullable: false })
  ticket: Ticket;

  @Column({ nullable: true })
  authorId: number | null;

  @Exclude()
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  author: User;

  @Column({ type: 'text' })
  content: string;

  @Exclude()
  @VersionColumn()
  version: number;

  @Exclude()
  @CreateDateColumn()
  createdAt: Date;

  @Exclude()
  @UpdateDateColumn()
  updatedAt: Date;

  @Exclude()
  @DeleteDateColumn({ nullable: true, type: 'timestamptz' })
  deletedAt: Date | null;

  @Exclude()
  @OneToMany(() => CommentMention, (mention) => mention.comment)
  mentions: CommentMention[];

  mentionedUsers: { id: number; username: string; fullName: string }[] = [];
}
