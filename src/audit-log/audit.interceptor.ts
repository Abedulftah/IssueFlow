import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { runWithUser } from '../database/current-user-store';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const userId: number | undefined = request?.user?.id;

    return new Observable(subscriber => {
      runWithUser(userId, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
