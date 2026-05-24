import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';
import * as currentUserStore from '../database/current-user-store';

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
  let runWithUserSpy: jest.SpyInstance;

  beforeEach(() => {
    interceptor = new AuditInterceptor();
    // Spy on runWithUser but still execute the callback so handle() is called
    runWithUserSpy = jest
      .spyOn(currentUserStore, 'runWithUser')
      .mockImplementation((_userId, fn) => fn());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calls runWithUser with the authenticated userId', (done) => {
    const context = makeContext(42);
    const handler = makeHandler();

    interceptor.intercept(context, handler).subscribe(() => {
      expect(runWithUserSpy).toHaveBeenCalledWith(42, expect.any(Function));
      done();
    });
  });

  it('calls runWithUser with undefined when request has no user', (done) => {
    const context = makeContext(undefined);
    const handler = makeHandler();

    interceptor.intercept(context, handler).subscribe(() => {
      expect(runWithUserSpy).toHaveBeenCalledWith(undefined, expect.any(Function));
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
