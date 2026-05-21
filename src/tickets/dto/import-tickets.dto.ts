import { IsNotEmpty, IsString } from 'class-validator';

export class ImportTicketsDto {
  @IsString()
  @IsNotEmpty()
  projectId: string;
}
