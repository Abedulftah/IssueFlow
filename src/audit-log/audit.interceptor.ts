import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.user?.sub;

    if (userId) {
      void this.dataSource.query('SET issueflow.current_user_id = $1', [userId]);
    }

    return next.handle().pipe(
      finalize(() => {
        void this.dataSource.query("SET issueflow.current_user_id = ''");
      }),
    );
  }
}
