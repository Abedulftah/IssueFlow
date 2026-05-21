export class ImportResultDto {
  created: number;
  failed: number;
  errors: Array<{ row: number; error: string }>;
}
