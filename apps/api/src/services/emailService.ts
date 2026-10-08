import { config } from "../config.js";
import type { Transporter } from "nodemailer";

/**
 * Email service abstraction.
 *
 * - In production: sends real emails via SMTP (requires SMTP_HOST env).
 * - In development / when unconfigured: logs to console (log-only mode).
 *
 * This allows the full email flow to be coded and tested without requiring
 * actual SMTP credentials during development or demos.
 */

interface EmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function safeUrl(value: string) {
  return escapeHtml(plainSafeUrl(value));
}

function plainSafeUrl(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "#";
  } catch {
    return "#";
  }
}

const smtpConfigured =
  Boolean(config.SMTP_HOST) &&
  Boolean(config.SMTP_PORT) &&
  Boolean(config.SMTP_USER) &&
  Boolean(config.SMTP_PASS) &&
  Boolean(config.SMTP_FROM);

let transporter: Transporter | null = null;

async function getTransporter() {
  if (transporter) return transporter;
  if (!smtpConfigured) return null;

  try {
    const nodemailer = await import("nodemailer");
    transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: Number(config.SMTP_PORT),
      secure: Number(config.SMTP_PORT) === 465,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
      auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined
    });
    return transporter;
  } catch (error) {
    console.warn("[Email] Nodemailer not available, using log-only mode.");
    return null;
  }
}

export async function sendEmail(payload: EmailPayload): Promise<{ sent: boolean; mode: "smtp" | "log" }> {
  const recipients = Array.isArray(payload.to) ? payload.to : [payload.to];

  const transport = await getTransporter();

  if (!transport) {
    // Do not log bodies: password-reset links and other sensitive action URLs may be present.
    console.log(`[Email LOG] Delivery disabled for ${recipients.length} recipient(s): ${payload.subject}`);
    return { sent: false, mode: "log" };
  }

  try {
    await transport.sendMail({
      from: config.SMTP_FROM,
      to: recipients.join(", "),
      subject: payload.subject,
      html: payload.html,
      text: payload.text || payload.html.replace(/<[^>]+>/g, "")
    });
    console.log(`[Email SMTP] Sent to ${recipients.join(", ")}: ${payload.subject}`);
    return { sent: true, mode: "smtp" };
  } catch (error) {
    console.error("[Email SMTP] Send failed:", error);
    return { sent: false, mode: "smtp" };
  }
}

/* ── Pre-built Templates ── */

export function emailCaseAssigned(caseCode: string, title: string, assigneeName: string, url: string) {
  caseCode = escapeHtml(caseCode); title = escapeHtml(title); assigneeName = escapeHtml(assigneeName); url = safeUrl(url);
  return {
    subject: `[CaseFlow] Bạn được giao hồ sơ ${caseCode}`,
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #155c4d;">Bạn có hồ sơ mới cần xử lý</h2>
        <p>Xin chào <strong>${assigneeName}</strong>,</p>
        <p>Hồ sơ <strong>${caseCode}</strong> — "${title}" đã được giao cho bạn.</p>
        <a href="${url}" style="display: inline-block; padding: 10px 20px; background: #155c4d; color: white; text-decoration: none; border-radius: 6px;">Mở hồ sơ</a>
        <p style="color: #666; font-size: 13px; margin-top: 24px;">— CaseFlow Service Intelligence</p>
      </div>
    `
  };
}

export function emailCaseResolved(caseCode: string, title: string, requesterName: string, url: string) {
  caseCode = escapeHtml(caseCode); title = escapeHtml(title); requesterName = escapeHtml(requesterName); url = safeUrl(url);
  return {
    subject: `[CaseFlow] Yêu cầu ${caseCode} đã được giải quyết`,
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #4f7a55;">Yêu cầu của bạn đã được xử lý</h2>
        <p>Xin chào <strong>${requesterName}</strong>,</p>
        <p>Hồ sơ <strong>${caseCode}</strong> — "${title}" đã hoàn tất. Vui lòng kiểm tra kết quả.</p>
        <a href="${url}" style="display: inline-block; padding: 10px 20px; background: #155c4d; color: white; text-decoration: none; border-radius: 6px;">Xem chi tiết</a>
        <p style="color: #666; font-size: 13px; margin-top: 24px;">— CaseFlow Service Intelligence</p>
      </div>
    `
  };
}

export function emailSlaWarning(caseCode: string, title: string, assigneeName: string, riskScore: number, url: string) {
  caseCode = escapeHtml(caseCode); title = escapeHtml(title); assigneeName = escapeHtml(assigneeName); url = safeUrl(url);
  riskScore = Number.isFinite(riskScore) ? Math.min(1, Math.max(0, riskScore)) : 0;
  return {
    subject: `[CaseFlow] ⚠ Cảnh báo SLA cho ${caseCode}`,
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #b7791f;">⚠ Cảnh báo nguy cơ trễ SLA</h2>
        <p>Xin chào <strong>${assigneeName}</strong>,</p>
        <p>Hồ sơ <strong>${caseCode}</strong> — "${title}" có điểm rủi ro SLA <strong>${Math.round(riskScore * 100)}%</strong>.</p>
        <p>Vui lòng ưu tiên xử lý hồ sơ này để đảm bảo đúng hạn cam kết.</p>
        <a href="${url}" style="display: inline-block; padding: 10px 20px; background: #b7791f; color: white; text-decoration: none; border-radius: 6px;">Xem hồ sơ</a>
        <p style="color: #666; font-size: 13px; margin-top: 24px;">— CaseFlow Service Intelligence</p>
      </div>
    `
  };
}

export function emailPasswordReset(recipientName: string, url: string) {
  const plainName = recipientName;
  const textUrl = plainSafeUrl(url);
  recipientName = escapeHtml(recipientName);
  url = safeUrl(url);
  return {
    subject: "[CaseFlow] Đặt lại mật khẩu",
    text: `Xin chào ${plainName},\n\nMở liên kết sau để đặt lại mật khẩu trong 30 phút: ${textUrl}\n\nNếu bạn không yêu cầu, hãy bỏ qua email này.`,
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #155c4d;">Đặt lại mật khẩu</h2>
        <p>Xin chào <strong>${recipientName}</strong>,</p>
        <p>Liên kết này có hiệu lực trong 30 phút và chỉ dùng được một lần.</p>
        <a href="${url}" style="display: inline-block; padding: 10px 20px; background: #155c4d; color: white; text-decoration: none; border-radius: 6px;">Đặt lại mật khẩu</a>
        <p style="color: #666; font-size: 13px; margin-top: 24px;">Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.</p>
      </div>
    `
  };
}
