import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { DataSource } from 'typeorm';
import { AuditInterceptor } from './audit.interceptor';

const makeContext = (userId?: string): ExecutionContext =>
  ({
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue({
        user: userId ? { sub: userId } : undefined,
      }),
    }),
  } as unknown as ExecutionContext);

const makeHandler = (): CallHandler => ({
  handle: jest.fn().mockReturnValue(of('result')),
});

describe('AuditInterceptor', () => {
  let interceptor: AuditInterceptor;
  let dataSource: { query: jest.Mock };

  beforeEach(() => {
    dataSource = { query: jest.fn().mockResolvedValue(undefined) };
    interceptor = new AuditInterceptor(dataSource as unknown as DataSource);
  });

  it('sets current_user_id when user is authenticated', () => {
    const context = makeContext('42');
    const handler = makeHandler();

    interceptor.intercept(context, handler).subscribe();

    expect(dataSource.query).toHaveBeenCalledWith(
      'SET issueflow.current_user_id = $1',
      ['42'],
    );
  });

  it('clears current_user_id in finalize after the observable completes', () => {
    const context = makeContext(undefined);
    const handler = makeHandler();

    // of() is synchronous — subscribe() returns only after teardown (finalize) runs
    interceptor.intercept(context, handler).subscribe();

    expect(dataSource.query).toHaveBeenCalledWith(
      "SET issueflow.current_user_id = ''",
    );
  });

  it('does not set user id when request has no authenticated user', () => {
    const context = makeContext(undefined);
    const handler = makeHandler();

    interceptor.intercept(context, handler).subscribe();

    expect(dataSource.query).not.toHaveBeenCalledWith(
      'SET issueflow.current_user_id = $1',
      expect.anything(),
    );
  });

  it('passes the response value through unchanged', () => {
    const context = makeContext('1');
    const handler = makeHandler();
    const values: any[] = [];

    interceptor.intercept(context, handler).subscribe({
      next: (v) => values.push(v),
    });

    expect(values).toEqual(['result']);
  });
});
