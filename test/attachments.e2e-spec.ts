import * as fs from 'fs';
import * as path from 'path';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { UserRole } from '../src/users/user.entity';
import { TicketPriority, TicketType } from '../src/tickets/enums';
import {
  bootstrapTestApp,
  closeTestApp,
  TestAppContext,
} from './support/test-app.bootstrap';
import { resetDatabase } from './support/db-reset.helper';

// Minimal valid 1×1 PNG (67 bytes)
const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108020000009001' +
    '2e00000000c4944415478' +
    '9cc3f80f00000101000518d84e00000000049454e44ae426082',
  'hex',
);

// Tiny plain-text file
const TINY_TXT = Buffer.from('hello world');

// Minimal JPEG SOI + EOI markers (a valid but empty JPEG)
const TINY_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);

// Minimal PDF header
const TINY_PDF = Buffer.from('%PDF-1.4\n%%EOF\n');

describe('Attachments API (e2e)', () => {
  let ctx: TestAppContext;
  let app: INestApplication;
  let adminToken: string;
  let ticketId: number;

  beforeAll(async () => {
    ctx = await bootstrapTestApp();
    app = ctx.app;
    await resetDatabase(ctx.dataSource);

    // Create admin user
    const adminRes = await request(app.getHttpServer())
      .post('/users')
      .send({ username: 'att_admin', email: 'att_admin@test.com', fullName: 'Att Admin', role: UserRole.ADMIN, password: 'secret' })
      .expect(200);
    const adminUserId: number = adminRes.body.id;

    // Login
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'att_admin', password: 'secret' })
      .expect(200);
    adminToken = loginRes.body.accessToken;

    // Create project
    const projRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Att Test Project', description: 'e2e', ownerId: adminUserId })
      .expect(200);
    const projectId: number = projRes.body.id;

    // Create ticket
    const ticketRes = await request(app.getHttpServer())
      .post('/tickets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Att Ticket', projectId, priority: TicketPriority.LOW, type: TicketType.TECHNICAL })
      .expect(200);
    ticketId = ticketRes.body.id;
  });

  afterAll(async () => {
    // Remove uploaded test files from disk
    const uploadDir = path.resolve('./uploads/attachments');
    if (fs.existsSync(uploadDir)) {
      for (const f of fs.readdirSync(uploadDir)) {
        fs.unlinkSync(path.join(uploadDir, f));
      }
    }
    await resetDatabase(ctx.dataSource);
    await closeTestApp(ctx);
  });

  // ── POST /tickets/:ticketId/attachments ───────────────────────────────────

  describe('POST /tickets/:ticketId/attachments', () => {
    it('returns 401 without a token', () => {
      return request(app.getHttpServer())
        .post(`/tickets/${ticketId}/attachments`)
        .attach('file', TINY_PNG, { filename: 'test.png', contentType: 'image/png' })
        .expect(401);
    });

    it('uploads a PNG and returns metadata', async () => {
      const res = await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/attachments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', TINY_PNG, { filename: 'photo.png', contentType: 'image/png' })
        .expect(200);

      expect(res.body).toMatchObject({
        id: expect.any(Number),
        filename: 'photo.png',
        contentType: 'image/png',
        ticketId,
      });
      expect(res.body.size).toBeUndefined();
      expect(res.body.storagePath).toBeUndefined();
      expect(res.body.createdAt).toBeUndefined();
    });

    it('uploads a plain-text file', async () => {
      const res = await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/attachments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', TINY_TXT, { filename: 'notes.txt', contentType: 'text/plain' })
        .expect(200);

      expect(res.body.contentType).toBe('text/plain');
      expect(res.body.filename).toBe('notes.txt');
    });

    it('uploads a JPEG and returns metadata', async () => {
      const res = await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/attachments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', TINY_JPEG, { filename: 'photo.jpg', contentType: 'image/jpeg' })
        .expect(200);

      expect(res.body).toMatchObject({
        id: expect.any(Number),
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
        ticketId,
      });
    });

    it('uploads a PDF and returns metadata', async () => {
      const res = await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/attachments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', TINY_PDF, { filename: 'report.pdf', contentType: 'application/pdf' })
        .expect(200);

      expect(res.body).toMatchObject({
        id: expect.any(Number),
        filename: 'report.pdf',
        contentType: 'application/pdf',
        ticketId,
      });
    });

    it('returns 400 for a disallowed MIME type (image/gif)', () => {
      return request(app.getHttpServer())
        .post(`/tickets/${ticketId}/attachments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', Buffer.from('GIF89a'), { filename: 'anim.gif', contentType: 'image/gif' })
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toMatch(/not allowed/i);
        });
    });

    it('returns 400 for a disallowed MIME type (application/zip)', () => {
      return request(app.getHttpServer())
        .post(`/tickets/${ticketId}/attachments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', Buffer.from('PK'), { filename: 'archive.zip', contentType: 'application/zip' })
        .expect(400);
    });

    it('returns 400 when the file exceeds 10 MB', () => {
      const bigBuffer = Buffer.alloc(11 * 1024 * 1024, 'a');
      return request(app.getHttpServer())
        .post(`/tickets/${ticketId}/attachments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', bigBuffer, { filename: 'big.txt', contentType: 'text/plain' })
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toMatch(/too large/i);
        });
    });

    it('returns 404 when the ticket does not exist', () => {
      return request(app.getHttpServer())
        .post('/tickets/999999/attachments')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', TINY_PNG, { filename: 'photo.png', contentType: 'image/png' })
        .expect(404);
    });
  });

  // ── DELETE /tickets/:ticketId/attachments/:id ─────────────────────────────

  describe('DELETE /tickets/:ticketId/attachments/:id', () => {
    let attachmentId: number;
    let uploadDir: string;
    let filesBefore: string[];

    beforeEach(async () => {
      uploadDir = path.resolve('./uploads/attachments');
      filesBefore = fs.existsSync(uploadDir) ? fs.readdirSync(uploadDir) : [];

      const res = await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/attachments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', TINY_TXT, { filename: 'delete-me.txt', contentType: 'text/plain' })
        .expect(200);
      attachmentId = res.body.id;
    });

    it('returns 401 without a token', () => {
      return request(app.getHttpServer())
        .delete(`/tickets/${ticketId}/attachments/${attachmentId}`)
        .expect(401);
    });

    it('deletes the attachment and removes the file from disk', async () => {
      const filesAfterUpload = fs.readdirSync(uploadDir);
      const newFile = filesAfterUpload.find((f) => !filesBefore.includes(f));
      expect(newFile).toBeDefined();

      await request(app.getHttpServer())
        .delete(`/tickets/${ticketId}/attachments/${attachmentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const filesAfterDelete = fs.readdirSync(uploadDir);
      expect(filesAfterDelete.includes(newFile!)).toBe(false);
    });

    it('returns 404 for a non-existent attachment id', () => {
      return request(app.getHttpServer())
        .delete(`/tickets/${ticketId}/attachments/999999`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

});
