import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('denied_tokens')
export class DeniedToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text', unique: true })
  token: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;
}
