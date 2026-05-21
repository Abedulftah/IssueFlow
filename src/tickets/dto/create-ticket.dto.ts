import { IsEnum, IsISO8601, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { TicketPriority, TicketStatus, TicketType } from '../enums';

export class CreateTicketDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsEnum(TicketPriority)
  priority: TicketPriority;

  @IsEnum(TicketType)
  type: TicketType;

  @IsInt()
  projectId: number;

  @IsOptional()
  @IsInt()
  assigneeId?: number;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;
}
