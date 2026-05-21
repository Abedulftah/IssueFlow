import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * NestJS FileInterceptor converts MulterError(LIMIT_FILE_SIZE) → PayloadTooLargeException (413).
 * This filter intercepts that at the upload endpoint and returns 400 instead, per spec.
 */
@Catch(PayloadTooLargeException)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const body = new BadRequestException(
      'File too large. Maximum size is 10 MB',
    ).getResponse();
    response.status(400).json(body);
  }
}
