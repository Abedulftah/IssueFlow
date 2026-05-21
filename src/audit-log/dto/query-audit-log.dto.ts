import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ActorType } from '../enums/actor-type.enum';

export class QueryAuditLogDto {
  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsEnum(ActorType)
  actor?: ActorType;
}
