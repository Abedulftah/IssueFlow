import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter = nodemailer.createTransport({
    host: 'localhost',
    port: 1025,
  });

  async sendMentionNotification(
    to: string,
    mentionedBy: string,
    ticketId: number,
    commentContent: string,
  ): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: 'no-reply@issueflow.local',
        to,
        subject: `You were mentioned in ticket #${ticketId}`,
        text: `${mentionedBy} mentioned you in a comment on ticket #${ticketId}:\n\n${commentContent}`,
        html: `<p><strong>${mentionedBy}</strong> mentioned you in a comment on ticket <strong>#${ticketId}</strong>:</p><blockquote>${commentContent}</blockquote>`,
      });
    } catch (err) {
      this.logger.error(`Failed to send mention email to ${to}: ${err.message}`);
    }
  }
}
