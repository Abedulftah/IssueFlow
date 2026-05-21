import { IsInt, IsNotEmpty, IsString } from 'class-validator';

export class CreateCommentDto {
  @IsInt()
  authorId: number;

  @IsString()
  @IsNotEmpty()
  content: string;
}
