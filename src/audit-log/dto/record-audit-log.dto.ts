import { ActorType } from '../enums/actor-type.enum';

export class RecordAuditLogDto {
  action: string;
  entityType: string;
  entityId: string;
  performedBy: string;
  actor: ActorType;
}
