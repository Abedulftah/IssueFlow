import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { Project } from '../projects/project.entity';
import { User } from '../users/user.entity';
import { TicketPriority, TicketStatus, TicketType } from './enums';

@Entity('tickets')
export class Ticket {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'enum', enum: TicketStatus, default: TicketStatus.TODO })
  status: TicketStatus;

  @Column({ type: 'enum', enum: TicketPriority })
  priority: TicketPriority;

  @Column({ type: 'enum', enum: TicketType })
  type: TicketType;

  @Column()
  projectId: number;

  @Exclude()
  @ManyToOne(() => Project, { eager: false })
  project: Project;

  @Column({ nullable: true })
  assigneeId: number;

  @Exclude()
  @ManyToOne(() => User, { eager: false, nullable: true, onDelete: 'SET NULL' })
  assignee: User;

  @Column({ nullable: true, type: 'timestamptz' })
  dueDate: Date;

  @Column({ default: false })
  isOverdue: boolean;

  @Exclude()
  @CreateDateColumn()
  createdAt: Date;

  @Exclude()
  @UpdateDateColumn()
  updatedAt: Date;

  @Exclude()
  @VersionColumn()
  version: number;

  @Exclude()
  @DeleteDateColumn({ nullable: true, type: 'timestamptz' })
  deletedAt: Date | null;

  @ManyToMany(() => Ticket, (ticket) => ticket.blockingTickets)
  @JoinTable({
    name: 'ticket_blocker',
    joinColumn: { name: 'blocked_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'blocker_id', referencedColumnName: 'id' },
  })
  blockers: Ticket[];

  @ManyToMany(() => Ticket, (ticket) => ticket.blockers)
  blockingTickets: Ticket[];
}
