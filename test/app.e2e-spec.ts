import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  bootstrapTestApp,
  closeTestApp,
  TestAppContext,
} from './support/test-app.bootstrap';

describe('AppController (e2e)', () => {
  let ctx: TestAppContext;
  let app: INestApplication;

  beforeAll(async () => {
    ctx = await bootstrapTestApp();
    app = ctx.app;
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('IssueFlow is running!');
  });
});
