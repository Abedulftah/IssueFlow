import {
  Column,
  CreateDateColumn,
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

  @Column()
  authorId: number;

  @Exclude()
  @ManyToOne(() => User, { nullable: false })
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
  @OneToMany(() => CommentMention, (mention) => mention.comment)
  mentions: CommentMention[];

  mentionedUsers: { id: number; username: string; fullName: string }[] = [];
}
