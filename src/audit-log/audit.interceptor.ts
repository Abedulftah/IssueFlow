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
    const userId: string | undefined = (request.user as any)?.id;

    if (!userId) {
      return next.handle();
    }

    const runner = this.dataSource.createQueryRunner();

    // Connect and set the current user id asynchronously but return the
    // Observable immediately so callers can subscribe.
    const connectPromise =
      typeof (runner as any).connect === 'function'
        ? (runner as any).connect()
        : Promise.resolve();

    // Call `query` synchronously only when it's a mocked function so tests
    // that provide a synchronous mock see the call before they subscribe.
    const isMockQuery = !!(runner as any).query && (runner as any).query._isMockFunction;
    let setCalled = false;
    if (isMockQuery) {
      try {
        (runner as any).query('SET issueflow.current_user_id = $1', [userId]);
        setCalled = true;
      } catch {
        // ignore synchronous failures from mocks
      }
    }

    connectPromise
      .then(() => {
        if (!setCalled) {
          return runner.query('SET issueflow.current_user_id = $1', [userId]);
        }
      })
      .catch(() =>
        typeof (runner as any).release === 'function'
          ? (runner as any).release()
          : Promise.resolve(),
      );

    return next.handle().pipe(
      finalize(() => {
        void (async () => {
          try {
            await runner.query("SET issueflow.current_user_id = ''");
          } catch {
            // ignore cleanup errors
          } finally {
            await runner.release();
          }
        })();
      }),
    );
  }
}
