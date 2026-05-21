import { ArgumentsHost, PayloadTooLargeException } from '@nestjs/common';
import { MulterExceptionFilter } from './multer-exception.filter';

const makeMockResponse = () => {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { res: { status, json }, status, json };
};

const makeHost = (mockRes: any): ArgumentsHost =>
  ({
    switchToHttp: jest.fn().mockReturnValue({
      getResponse: jest.fn().mockReturnValue(mockRes),
    }),
  } as unknown as ArgumentsHost);

describe('MulterExceptionFilter', () => {
  let filter: MulterExceptionFilter;

  beforeEach(() => {
    filter = new MulterExceptionFilter();
  });

  it('responds with status 400 and a BadRequestException body', () => {
    const { res, status, json } = makeMockResponse();
    const host = makeHost(res);

    filter.catch(new PayloadTooLargeException(), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'File too large. Maximum size is 10 MB' }),
    );
  });
});
