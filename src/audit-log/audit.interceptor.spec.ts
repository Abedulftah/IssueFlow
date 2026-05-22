import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, lastValueFrom } from 'rxjs';
import { DataSource, QueryRunner } from 'typeorm';
import { AuditInterceptor } from './audit.interceptor';

const makeContext = (userId?: string): ExecutionContext =>
  ({
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue({
        user: userId ? { id: userId } : undefined,
      }),
    }),
  } as unknown as ExecutionContext);

const makeHandler = (): CallHandler => ({
  handle: jest.fn().mockReturnValue(of('result')),
});

describe('AuditInterceptor', () => {
  let interceptor: AuditInterceptor;
  let mockQueryRunner: jest.Mocked<Partial<QueryRunner>>;
  let mockDataSource: jest.Mocked<Partial<DataSource>>;

  beforeEach(() => {
    mockQueryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };
    mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    };
    interceptor = new AuditInterceptor(mockDataSource as unknown as DataSource);
  });

  it('sets current_user_id when user is authenticated', (done) => {
    const context = makeContext('42');
    const handler = makeHandler();

    interceptor.intercept(context, handler).subscribe(() => {
      expect(mockQueryRunner.query).toHaveBeenCalledWith(
        'SET issueflow.current_user_id = $1',
        ['42'],
      );
      done();
    });
  });

  it('clears current_user_id after the observable completes', async () => {
    const context = makeContext('42');
    const handler = makeHandler();

    await lastValueFrom(interceptor.intercept(context, handler));

    expect(mockQueryRunner.query).toHaveBeenCalledWith(
      "SET issueflow.current_user_id = ''",
    );
    expect(mockQueryRunner.release).toHaveBeenCalled();
  });

  it('does not create QueryRunner when request has no authenticated user', (done) => {
    const context = makeContext(undefined);
    const handler = makeHandler();

    interceptor.intercept(context, handler).subscribe(() => {
      expect(mockDataSource.createQueryRunner).not.toHaveBeenCalled();
      done();
    });
  });

  it('passes the response value through unchanged', (done) => {
    const context = makeContext('1');
    const handler = makeHandler();
    const values: any[] = [];

    interceptor.intercept(context, handler).subscribe({
      next: (v) => values.push(v),
      complete: () => {
        expect(values).toEqual(['result']);
        done();
      },
    });
  });
});
