import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { UserRole } from '../../src/users/user.entity';
import {
  bootstrapTestApp,
  closeTestApp,
  TestAppContext,
} from '../support/test-app.bootstrap';
import { resetDatabase } from '../support/db-reset.helper';
import { seedAndLogin, AuthSession } from '../support/auth.helper';
import { makeProjectPayload } from '../support/factories/project.factory';
import { makeTicketPayload } from '../support/factories/ticket.factory';
import {
  buildOversizedBuffer,
  fixtures,
  readFixture,
} from '../support/factories/file.factory';

describe('Attachments upload (multipart) journey (e2e)', () => {
  let ctx: TestAppContext;
  let admin: AuthSession;
  let ticketId: number;

  beforeAll(async () => {
    ctx = await bootstrapTestApp();
  });

  afterAll(async () => {
    const uploadDir = path.resolve('./uploads/attachments');
    if (fs.existsSync(uploadDir)) {
      for (const f of fs.readdirSync(uploadDir)) {
        try {
          fs.unlinkSync(path.join(uploadDir, f));
        } catch {
          // ignore - file may have been removed by DELETE under test
        }
      }
    }
    await resetDatabase(ctx.dataSource);
    await closeTestApp(ctx);
  });

  beforeEach(async () => {
    await resetDatabase(ctx.dataSource);
    admin = await seedAndLogin(ctx.app, { role: UserRole.ADMIN });

    const projRes = await request(ctx.app.getHttpServer())
      .post('/projects')
      .set(admin.authHeader)
      .send(makeProjectPayload(admin.id))
      .expect(200);

    const ticketRes = await request(ctx.app.getHttpServer())
      .post('/tickets')
      .set(admin.authHeader)
      .send(makeTicketPayload(projRes.body.id))
      .expect(200);
    ticketId = ticketRes.body.id;
  });

  // ── POST /tickets/:ticketId/attachments — happy paths ───────────────────

  it('uploads a PNG file from a fixture on disk', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post(`/tickets/${ticketId}/attachments`)
      .set(admin.authHeader)
      .attach('file', fixtures.tinyPngPath, {
        filename: 'screenshot.png',
        contentType: 'image/png',
      })
      .expect(200);

    expect(res.body).toMatchObject({
      id: expect.any(Number),
      filename: 'screenshot.png',
      contentType: 'image/png',
      ticketId,
    });
    expect(res.body.size).toBeUndefined();
    expect(res.body.storagePath).toBeUndefined();
  });

  it('uploads a PNG file from an in-memory Buffer', async () => {
    const buffer = readFixture('tiny.png');
    const res = await request(ctx.app.getHttpServer())
      .post(`/tickets/${ticketId}/attachments`)
      .set(admin.authHeader)
      .attach('file', buffer, {
        filename: 'inline.png',
        contentType: 'image/png',
      })
      .expect(200);

    expect(res.body).toMatchObject({
      contentType: 'image/png',
      filename: 'inline.png',
      ticketId,
    });
    expect(res.body.size).toBeUndefined();
  });

  it('uploads a plain-text file', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post(`/tickets/${ticketId}/attachments`)
      .set(admin.authHeader)
      .attach('file', fixtures.tinyTxtPath, {
        filename: 'notes.txt',
        contentType: 'text/plain',
      })
      .expect(200);

    expect(res.body.contentType).toBe('text/plain');
    expect(res.body.filename).toBe('notes.txt');
  });

  // ── POST /tickets/:ticketId/attachments — Multer rejection paths ────────

  it('returns 400 for a disallowed MIME type', () => {
    return request(ctx.app.getHttpServer())
      .post(`/tickets/${ticketId}/attachments`)
      .set(admin.authHeader)
      .attach('file', Buffer.from('GIF89a'), {
        filename: 'anim.gif',
        contentType: 'image/gif',
      })
      .expect(400)
      .expect((res) => {
        expect(res.body.message).toMatch(/not allowed/i);
      });
  });

  it('returns 400 when the file exceeds 10 MB', () => {
    const bigBuffer = buildOversizedBuffer(11);
    return request(ctx.app.getHttpServer())
      .post(`/tickets/${ticketId}/attachments`)
      .set(admin.authHeader)
      .attach('file', bigBuffer, {
        filename: 'big.txt',
        contentType: 'text/plain',
      })
      .expect(400)
      .expect((res) => {
        expect(res.body.message).toMatch(/too large/i);
      });
  });

  it('returns 401 when no JWT is supplied', () => {
    return request(ctx.app.getHttpServer())
      .post(`/tickets/${ticketId}/attachments`)
      .attach('file', fixtures.tinyPngPath, {
        filename: 'screenshot.png',
        contentType: 'image/png',
      })
      .expect(401);
  });

  it('returns 404 when the ticket does not exist', () => {
    return request(ctx.app.getHttpServer())
      .post('/tickets/999999/attachments')
      .set(admin.authHeader)
      .attach('file', fixtures.tinyPngPath, {
        filename: 'screenshot.png',
        contentType: 'image/png',
      })
      .expect(404);
  });

  // ── End-to-end: upload then delete reflects state ───────────────────────

  it('upload → delete: attachment is removed from DB and disk', async () => {
    const uploadDir = path.resolve('./uploads/attachments');
    const filesBefore = fs.existsSync(uploadDir) ? fs.readdirSync(uploadDir) : [];

    const uploadRes = await request(ctx.app.getHttpServer())
      .post(`/tickets/${ticketId}/attachments`)
      .set(admin.authHeader)
      .attach('file', fixtures.tinyTxtPath, {
        filename: 'cleanup.txt',
        contentType: 'text/plain',
      })
      .expect(200);

    const attachmentId: number = uploadRes.body.id;
    const filesAfterUpload = fs.readdirSync(uploadDir);
    const newFile = filesAfterUpload.find((f) => !filesBefore.includes(f));
    expect(newFile).toBeDefined();

    await request(ctx.app.getHttpServer())
      .delete(`/tickets/${ticketId}/attachments/${attachmentId}`)
      .set(admin.authHeader)
      .expect(200);

    const filesAfterDelete = fs.readdirSync(uploadDir);
    expect(filesAfterDelete.includes(newFile!)).toBe(false);
  });
});
