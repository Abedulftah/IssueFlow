import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ActorType } from '../enums/actor-type.enum';

@Entity('audit_logs')
@Index(['entityType', 'entityId'])
@Index(['actor', 'action'])
export class AuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  action: string;

  @Column()
  entityType: string;

  @Column()
  entityId: string;

  @Column()
  performedBy: string;

  @Column({ type: 'enum', enum: ActorType })
  actor: ActorType;

  @CreateDateColumn({ type: 'timestamptz' })
  timestamp: Date;
}
