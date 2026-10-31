import nodemailer from "nodemailer";

export function isMailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransport() {
  const port = Number(process.env.SMTP_PORT || 465);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // true for 465, false for 587
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/**
 * Sends the password-reset email. If SMTP isn't configured, the link is logged
 * to the server console instead so the flow still works during local dev.
 * Returns true if an email was actually sent.
 */
export async function sendPasswordResetEmail(
  to: string,
  resetLink: string,
): Promise<boolean> {
  if (!isMailConfigured()) {
    console.log(
      `\n[password-reset] SMTP not configured — link for ${to}:\n${resetLink}\n`,
    );
    return false;
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await getTransport().sendMail({
    from,
    to,
    subject: "Reset your Sahayak AI password",
    text: `Reset your password using this link (valid for 1 hour):\n\n${resetLink}\n\nIf you didn't request this, you can ignore this email.`,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#111">Reset your password</h2>
        <p style="color:#555">We received a request to reset your Sahayak AI password. This link is valid for 1 hour.</p>
        <p style="margin:28px 0">
          <a href="${resetLink}" style="background:#000;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600">Reset Password</a>
        </p>
        <p style="color:#999;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });
  return true;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Delivers a website contact-form submission to the site's inbox.
 * `to` is the destination (site owner). replyTo is the sender so the owner can
 * reply to them directly. Returns true if an email was actually sent.
 */
export async function sendContactEmail(
  to: string,
  opts: { name: string; email: string; subject?: string; message: string },
): Promise<boolean> {
  const subjectLine = opts.subject?.trim()
    ? `Contact form: ${opts.subject.trim()}`
    : "New contact form submission";
  if (!isMailConfigured()) {
    console.log(
      `\n[contact] SMTP not configured — would notify ${to}:\n` +
        `from ${opts.name} <${opts.email}>\nsubject: ${opts.subject || "(none)"}\n${opts.message}\n`,
    );
    return false;
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await getTransport().sendMail({
    from, // must be the authenticated account; the sender goes in replyTo
    to,
    replyTo: opts.email,
    subject: subjectLine,
    text:
      `New contact form submission from the Sahayak AI website.\n\n` +
      `Name: ${opts.name}\nEmail: ${opts.email}\n` +
      (opts.subject ? `Subject: ${opts.subject}\n` : "") +
      `\nMessage:\n${opts.message}\n`,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:auto">
        <h2 style="color:#111">New contact form submission</h2>
        <table style="border-collapse:collapse;margin:16px 0;width:100%">
          <tr><td style="padding:6px 12px;color:#888;width:90px">Name</td><td style="padding:6px 12px;font-weight:600">${escapeHtml(opts.name)}</td></tr>
          <tr><td style="padding:6px 12px;color:#888">Email</td><td style="padding:6px 12px;font-weight:600">${escapeHtml(opts.email)}</td></tr>
          ${opts.subject ? `<tr><td style="padding:6px 12px;color:#888">Subject</td><td style="padding:6px 12px">${escapeHtml(opts.subject)}</td></tr>` : ""}
          <tr><td style="padding:6px 12px;color:#888;vertical-align:top">Message</td><td style="padding:6px 12px;white-space:pre-wrap">${escapeHtml(opts.message)}</td></tr>
        </table>
        <p style="color:#999;font-size:13px">Reply to this email to respond to ${escapeHtml(opts.name)} directly.</p>
      </div>
    `,
  });
  return true;
}

/** Notifies the business that a visitor is waiting to chat with a human. */
export async function sendHumanRequestEmail(
  to: string,
  opts: { businessName?: string; visitorEmail?: string },
): Promise<boolean> {
  const business = opts.businessName || "your website";
  if (!isMailConfigured()) {
    console.log(
      `\n[human-request] SMTP not configured — would notify ${to}: ` +
        `a visitor on ${business} wants a human.\n`,
    );
    return false;
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await getTransport().sendMail({
    from,
    to,
    replyTo: opts.visitorEmail || undefined,
    subject: `A visitor on ${business} wants to chat with a human`,
    text:
      `A visitor is waiting for a human in the live chat on ${business}.\n` +
      (opts.visitorEmail ? `Visitor email: ${opts.visitorEmail}\n` : "") +
      `\nOpen your dashboard Inbox to reply.`,
  });
  return true;
}

/**
 * Forwards an unanswered visitor question to the business's support inbox.
 * replyTo is the visitor so the business can respond to them directly.
 * Returns true if an email was actually sent.
 */
export async function sendSupportLeadEmail(
  to: string,
  opts: { businessName?: string; visitorEmail: string; question: string },
): Promise<boolean> {
  const business = opts.businessName || "your website";
  if (!isMailConfigured()) {
    console.log(
      `\n[support-lead] SMTP not configured — would notify ${to}:\n` +
        `from ${opts.visitorEmail} re: ${opts.question}\n`,
    );
    return false;
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await getTransport().sendMail({
    from,
    to,
    replyTo: opts.visitorEmail,
    subject: `New support question from a ${business} visitor`,
    text: `A visitor asked something the chatbot couldn't answer.\n\nVisitor email: ${opts.visitorEmail}\nQuestion: ${opts.question}\n\nReply directly to this email to respond to the visitor.`,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:auto">
        <h2 style="color:#111">New support question</h2>
        <p style="color:#555">A visitor on <b>${business}</b> asked something the chatbot couldn't answer.</p>
        <table style="border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:6px 12px;color:#888">Visitor email</td><td style="padding:6px 12px;font-weight:600">${opts.visitorEmail}</td></tr>
          <tr><td style="padding:6px 12px;color:#888;vertical-align:top">Question</td><td style="padding:6px 12px">${opts.question}</td></tr>
        </table>
        <p style="color:#999;font-size:13px">Reply to this email to respond to the visitor directly.</p>
      </div>
    `,
  });
  return true;
}
