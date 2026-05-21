import { IsInt, IsNotEmpty } from 'class-validator';

export class CreateDependencyDto {
  @IsInt()
  @IsNotEmpty()
  blockedBy: number;
}
