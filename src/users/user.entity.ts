import { Exclude } from 'class-transformer';
import { randomUUID } from 'crypto';
import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum UserRole {
  ADMIN = 'ADMIN',
  DEVELOPER = 'DEVELOPER',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string;

  @Column({ unique: true })
  email: string;

  @Column()
  fullName: string;

  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;

  @Exclude()
  @Column({ nullable: true })
  passwordHash: string;

  @Exclude()
  @Column({ type: 'text', nullable: true })
  authVersion: string;

  @Exclude()
  @CreateDateColumn()
  createdAt: Date;

  @Exclude()
  @UpdateDateColumn()
  updatedAt: Date;

  @BeforeInsert()
  @BeforeUpdate()
  ensureAuthVersion() {
    if (!this.authVersion) {
      this.authVersion = randomUUID();
    }
  }
}
