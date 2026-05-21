import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Comment } from './comment.entity';
import { User } from '../users/user.entity';

@Entity('comment_mention')
export class CommentMention {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  commentId: number;

  @ManyToOne(() => Comment, (comment) => comment.mentions, { onDelete: 'CASCADE' })
  comment: Comment;

  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  user: User;
}
