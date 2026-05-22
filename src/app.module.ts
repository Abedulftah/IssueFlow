import 'dotenv/config';
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProjectsModule } from './projects/projects.module';
import { TicketsModule } from './tickets/tickets.module';
import { CommentsModule } from './comments/comments.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { DependenciesModule } from './dependencies/dependencies.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { AuditInterceptor } from './audit-log/audit.interceptor';
import { MailModule } from './mail/mail.module';
import { SchedulerModule } from './scheduler/scheduler.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: parseInt(process.env.DB_PORT ?? '5432', 10),
      username: process.env.DB_USER ?? 'issueflow',
      password: process.env.DB_PASS ?? 'issueflow',
      database: process.env.DB_NAME ?? 'issueflow',
      autoLoadEntities: true,
      synchronize: true,
    }),
    AuditLogModule,
    UsersModule,
    AuthModule,
    ProjectsModule,
    TicketsModule,
    CommentsModule,
    DependenciesModule,
    AttachmentsModule,
    MailModule,
    SchedulerModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
