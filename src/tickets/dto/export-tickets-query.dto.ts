import { IsNotEmpty, IsString } from 'class-validator';

export class ExportTicketsQueryDto {
  @IsString()
  @IsNotEmpty()
  projectId: string;
}
