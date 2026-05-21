import {
  ClassSerializerInterceptor,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule, TestingModuleBuilder } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';

export interface TestAppContext {
  app: INestApplication;
  moduleRef: TestingModule;
  dataSource: DataSource;
}

export interface BootstrapOptions {
  customize?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

export async function bootstrapTestApp(
  options: BootstrapOptions = {},
): Promise<TestAppContext> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (options.customize) builder = options.customize(builder);

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false }),
  );
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  app.enableShutdownHooks();

  await app.init();

  const dataSource = app.get(DataSource);
  return { app, moduleRef, dataSource };
}

export async function closeTestApp(ctx: TestAppContext): Promise<void> {
  await ctx.app.close();
}
