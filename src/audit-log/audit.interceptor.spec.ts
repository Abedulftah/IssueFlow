import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, lastValueFrom } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';

const makeContext = (userId?: number): ExecutionContext =>
  ({
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue({
        user: userId !== undefined ? { id: userId } : undefined,
      }),
    }),
  } as unknown as ExecutionContext);

const makeHandler = (): CallHandler => ({
  handle: jest.fn().mockReturnValue(of('result')),
});

describe('AuditInterceptor', () => {
  let interceptor: AuditInterceptor;

  beforeEach(() => {
    interceptor = new AuditInterceptor();
  });

  it('passes through authenticated requests unchanged', (done) => {
    const context = makeContext(42);
    const handler = makeHandler();

    interceptor.intercept(context, handler).subscribe(() => {
      expect(handler.handle).toHaveBeenCalled();
      done();
    });
  });

  it('passes through unauthenticated requests unchanged', (done) => {
    const context = makeContext(undefined);
    const handler = makeHandler();

    interceptor.intercept(context, handler).subscribe(() => {
      expect(handler.handle).toHaveBeenCalled();
      done();
    });
  });

  it('passes the response value through unchanged', (done) => {
    const context = makeContext(1);
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
