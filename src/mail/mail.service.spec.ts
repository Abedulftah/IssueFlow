import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from './mail.service';
import * as nodemailer from 'nodemailer';

jest.mock('nodemailer');

describe('MailService', () => {
  let service: MailService;
  let sendMailMock: jest.Mock;

  beforeEach(async () => {
    sendMailMock = jest.fn().mockResolvedValue({ messageId: 'test-id' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({
      sendMail: sendMailMock,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [MailService],
    }).compile();

    service = module.get(MailService);
  });

  it('calls sendMail with correct to, subject, and body', async () => {
    await service.sendMentionNotification(
      'alice@example.com',
      'bob',
      42,
      'please review this',
    );

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'alice@example.com',
        subject: expect.stringContaining('42'),
        text: expect.stringContaining('bob'),
      }),
    );
  });

  it('swallows SMTP errors without throwing', async () => {
    sendMailMock.mockRejectedValue(new Error('SMTP connection refused'));

    await expect(
      service.sendMentionNotification('x@x.com', 'someone', 1, 'hello'),
    ).resolves.toBeUndefined();
  });
});
