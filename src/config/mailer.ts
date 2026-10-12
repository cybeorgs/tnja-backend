import { createRequire } from "module";
const require = createRequire(import.meta.url);
const nodemailer = require("nodemailer");

// SMTP config mirrored from plugin/plugin/mail.php
const SMTP_HOST     = process.env.SMTP_HOST     || "smtp.gmail.com";
const SMTP_PORT     = parseInt(process.env.SMTP_PORT || "587");
const SMTP_USER     = process.env.SMTP_USER     || "ikasletechnologyservices@gmail.com";
const SMTP_PASS     = process.env.SMTP_PASS     || "ocup ccca mhev hksb";
const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME || "Tamil Nadu Judo Association";

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: false, // STARTTLS
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

interface ApprovalMailOptions {
  toEmail: string;
  toName: string;
  tempId: string;
  permanentId: string;
  password: string;        // raw (un-hashed) password
  role: "Student" | "Coach" | "Member" | "Club";
}

export async function sendApprovalEmail(opts: ApprovalMailOptions) {
  const { toEmail, toName, tempId, permanentId, password, role } = opts;

  const idLabel = role === "Student" ? "Player ID" :
                  role === "Coach" ? "Coach ID" :
                  role === "Club" ? "Club ID" : "Member ID";
  const tempIdLabel = role === "Student" ? "Temporary Player ID" :
                      role === "Coach" ? "Temporary Coach ID" :
                      role === "Club" ? "Temporary Club ID" : "Temporary Member ID";

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap');
    body { margin:0; font-family:'Roboto',sans-serif; background:#1e3a8a; color:#333; }
    .wrapper { padding: 40px 20px; }
    .container { max-width:600px; margin:auto; background:#fff; border-radius:16px;
                 box-shadow:0 8px 32px rgba(0,0,0,0.18); overflow:hidden; }
    .header { background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%);
              padding:36px 40px; text-align:center; }
    .header img { max-width:80px; margin-bottom:12px; }
    .header h1 { color:#fff; margin:0; font-size:22px; letter-spacing:1px; }
    .header p  { color:#bfdbfe; margin:6px 0 0; font-size:14px; }
    .body { padding:36px 40px; }
    .body h2 { color:#1e3a8a; font-size:20px; margin-top:0; }
    .body p  { color:#475569; line-height:1.7; }
    .credentials { background:#f0f9ff; border:1px solid #bae6fd; border-radius:12px;
                   padding:20px 24px; margin:24px 0; }
    .credentials table { width:100%; border-collapse:collapse; }
    .credentials td { padding:10px 0; border-bottom:1px solid #e0f2fe; font-size:15px; }
    .credentials td:first-child { font-weight:700; color:#1e3a8a; width:45%; }
    .credentials tr:last-child td { border-bottom:none; }
    .badge { display:inline-block; background:#dcfce7; color:#16a34a;
             border-radius:999px; padding:4px 16px; font-weight:700; font-size:13px; }
    .footer { background:#f8fafc; padding:20px 40px; text-align:center;
              border-top:1px solid #e2e8f0; color:#94a3b8; font-size:12px; }
    .warning { background:#fef9c3; border:1px solid #fde68a; border-radius:8px;
               padding:12px 16px; color:#92400e; font-size:13px; margin-top:16px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <h1>Tamil Nadu Judo Association</h1>
        <p>Official Registration Portal</p>
      </div>
      <div class="body">
        <h2> Your Application is Approved!</h2>
        <p>Dear <strong>${toName}</strong>,</p>
        <p>We are pleased to inform you that your <strong>${role}</strong> application has been reviewed and <span class="badge">APPROVED</span> by the TNJA Super Admin.</p>
        <p>Your permanent membership credentials are below. Please use them to log in to the TNJA portal:</p>
        <div class="credentials">
          <table>
            <tr>
              <td>${tempIdLabel}</td>
              <td>${tempId}</td>
            </tr>
            <tr>
              <td>${idLabel}</td>
              <td><strong>${permanentId}</strong></td>
            </tr>
            <tr>
              <td>Password</td>
              <td><strong>${password}</strong></td>
            </tr>
            <tr>
              <td>Role</td>
              <td>${role}</td>
            </tr>
          </table>
        </div>
        <div class="warning">
          <svg style="vertical-align:middle; margin-right:6px;" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m12 9 0 4"/><path d="m12 17.01 0.01 0"/><path d="m2.09 19.4 9-16a2 2 0 0 1 3.82 0l9 16A2 2 0 0 1 21.91 22H2.09a2 2 0 0 1-1.72-2.6z"/></svg>
          Please change your password after your first login for security purposes.
        </div>
        <p style="margin-top:24px;">Welcome to the Tamil Nadu Judo Association family!</p>
        <p>Regards,<br/><strong>TNJA Admin Team</strong></p>
      </div>
      <div class="footer">
        © ${new Date().getFullYear()} Tamil Nadu Judo Association. All rights reserved.<br/>
        This is an automated email. Please do not reply directly to this message.
      </div>
    </div>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: `"${SMTP_FROM_NAME}" <${SMTP_USER}>`,
    to: `"${toName}" <${toEmail}>`,
    subject: `TNJA Application Approved – Your Login Credentials`,
    html,
  });

  console.log(`[Mailer] Approval email sent to ${toEmail} (${role})`);
}

export async function sendRejectionEmail(opts: {
  toEmail: string;
  toName: string;
  role: string;
  remark: string;
}) {
  const { toEmail, toName, role, remark } = opts;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap');
    body { margin:0; font-family:'Roboto',sans-serif; background:#7f1d1d; color:#333; }
    .wrapper { padding: 40px 20px; }
    .container { max-width:600px; margin:auto; background:#fff; border-radius:16px; overflow:hidden;
                 box-shadow:0 8px 32px rgba(0,0,0,0.18); }
    .header { background:linear-gradient(135deg,#7f1d1d 0%,#dc2626 100%);
              padding:36px 40px; text-align:center; }
    .header h1 { color:#fff; margin:0; font-size:22px; }
    .header p  { color:#fecaca; margin:6px 0 0; font-size:14px; }
    .body { padding:36px 40px; }
    .body h2 { color:#dc2626; margin-top:0; }
    .body p  { color:#475569; line-height:1.7; }
    .remark { background:#fef2f2; border:1px solid #fecaca; border-radius:12px;
              padding:16px 20px; color:#7f1d1d; margin:20px 0; }
    .footer { background:#f8fafc; padding:20px 40px; text-align:center;
              border-top:1px solid #e2e8f0; color:#94a3b8; font-size:12px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <h1>Tamil Nadu Judo Association</h1>
        <p>Official Registration Portal</p>
      </div>
      <div class="body">
        <h2>Application Status Update</h2>
        <p>Dear <strong>${toName}</strong>,</p>
        <p>After careful review, your <strong>${role}</strong> application has been <strong>rejected</strong> by the TNJA Admin.</p>
        <div class="remark">
          <strong>Reason:</strong><br/>${remark}
        </div>
        <p>If you believe this is an error or would like to re-apply, please contact the TNJA office.</p>
        <p>Regards,<br/><strong>TNJA Admin Team</strong></p>
      </div>
      <div class="footer">
        © ${new Date().getFullYear()} Tamil Nadu Judo Association. All rights reserved.
      </div>
    </div>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: `"${SMTP_FROM_NAME}" <${SMTP_USER}>`,
    to: `"${toName}" <${toEmail}>`,
    subject: `TNJA Application Status – Action Required`,
    html,
  });

  console.log(`[Mailer] Rejection email sent to ${toEmail} (${role})`);
}

export async function sendPaymentRequestEmail(opts: {
  toEmail: string;
  toName: string;
  tempId: string;
  password: string;
  role: "Player" | "Coach" | "Member" | "Club";
}) {
  const { toEmail, toName, tempId, password, role } = opts;

  const idLabel = role === "Player" ? "Player ID" :
                  role === "Coach" ? "Coach ID" :
                  role === "Club" ? "Club ID" : "Member ID";
  const tempIdLabel = role === "Player" ? "Temporary Player ID" :
                      role === "Coach" ? "Temporary Coach ID" :
                      role === "Club" ? "Temporary Club ID" : "Temporary Member ID";

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap');
    body { margin:0; font-family:'Roboto',sans-serif; background:#f0f9ff; color:#333; }
    .wrapper { padding: 40px 20px; }
    .container { max-width:600px; margin:auto; background:#fff; border-radius:16px; overflow:hidden;
                 box-shadow:0 8px 32px rgba(0,0,0,0.18); }
    .header { background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%);
              padding:36px 40px; text-align:center; }
    .header h1 { color:#fff; margin:0; font-size:22px; }
    .body { padding:36px 40px; }
    .body h2 { color:#2563eb; margin-top:0; }
    .body p  { color:#475569; line-height:1.7; }
    .action { background:#f0f9ff; border:1px solid #bae6fd; border-radius:12px;
              padding:20px 24px; margin:24px 0; }
    .action table { width:100%; border-collapse:collapse; }
    .action td { padding:8px 0; font-size:15px; }
    .action td:first-child { font-weight:700; color:#1e3a8a; width:40%; }
    .footer { background:#f8fafc; padding:20px 40px; text-align:center;
              border-top:1px solid #e2e8f0; color:#94a3b8; font-size:12px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <h1>Tamil Nadu Judo Association</h1>
        <p style="color:#bfdbfe; margin:6px 0 0;">Application Approved - Action Required</p>
      </div>
      <div class="body">
        <h2> Good News!</h2>
        <p>Dear <strong>${toName}</strong>,</p>
        <p>Your <strong>${role}</strong> application has been <strong>APPROVED</strong> by the TNJA Admin.</p>
        <p>To finalize your registration and receive your <strong>${idLabel}</strong>, please log in to the portal and complete the membership payment.</p>
        
        <div class="action">
          <p style="margin-bottom:12px; font-weight:700; color:#1e3a8a;">Your Login Credentials:</p>
          <table>
            <tr>
              <td>${tempIdLabel}</td>
              <td><strong>${tempId}</strong></td>
            </tr>
            <tr>
              <td>Password</td>
              <td><strong>${password}</strong></td>
            </tr>
          </table>
        </div>

        <p>Once the payment is successful, your ${idLabel} and final credentials will be issued immediately.</p>
        <p>Regards,<br/><strong>TNJA Admin Team</strong></p>
      </div>
      <div class="footer">
        © ${new Date().getFullYear()} Tamil Nadu Judo Association. All rights reserved.
      </div>
    </div>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: `"${SMTP_FROM_NAME}" <${SMTP_USER}>`,
    to: `"${toName}" <${toEmail}>`,
    subject: `TNJA Application Approved – Complete Your Payment`,
    html,
  });

  console.log(`[Mailer] Payment request email sent to ${toEmail} (${role})`);
}

export async function sendClubRegistrationEmail(opts: {
  toEmail: string;
  toName: string;
  tempId?: string;
  password?: string;
}) {
  const { toEmail, toName, tempId, password } = opts;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap');
    body { margin:0; font-family:'Roboto',sans-serif; background:#f8fafc; color:#333; }
    .wrapper { padding: 40px 20px; }
    .container { max-width:600px; margin:auto; background:#fff; border-radius:16px; overflow:hidden;
                 box-shadow:0 8px 32px rgba(0,0,0,0.12); }
    .header { background:linear-gradient(135deg,#1e293b 0%,#334155 100%);
              padding:36px 40px; text-align:center; }
    .header h1 { color:#fff; margin:0; font-size:22px; }
    .body { padding:36px 40px; }
    .body h2 { color:#1e293b; margin-top:0; }
    .body p  { color:#475569; line-height:1.7; }
    .status { display:inline-block; background:#fef3c7; color:#92400e;
              border-radius:999px; padding:4px 16px; font-weight:700; font-size:13px; }
    .footer { background:#f1f5f9; padding:20px 40px; text-align:center;
              border-top:1px solid #e2e8f0; color:#64748b; font-size:12px; }
    .temp-id-box { background:#f0f9ff; border:1px solid #bae6fd; padding:12px; border-radius:8px; margin-top:16px; font-weight:bold; color:#1e3a8a; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <h1>Tamil Nadu Judo Association</h1>
        <p style="color:#94a3b8; margin:6px 0 0;">Club Registration Received</p>
      </div>
      <div class="body">
        <h2>Hello ${toName},</h2>
        <p>Thank you for registering your Club/Organization with the Tamil Nadu Judo Association.</p>
        <p>Your application is currently <span class="status">PENDING APPROVAL</span>.</p>
        ${tempId ? `
        <div class="temp-id-box">
          <div>Your Temporary Club ID is: <strong>${tempId}</strong></div>
          ${password ? `<div style="margin-top:8px;">Your Password is: <strong>${password}</strong></div>` : ''}
          <p style="font-size:13px; font-weight:normal; margin-top:8px; color:#475569;">You can use these credentials to log in and check your application status or make requested changes.</p>
        </div>` : ''}
        <p>Our team will review your details shortly. Once approved, you will receive your official login credentials via email.</p>
        <p>If you have any questions, please contact the TNJA state office.</p>
        <p>Regards,<br/><strong>TNJA Admin Team</strong></p>
      </div>
      <div class="footer">
        © ${new Date().getFullYear()} Tamil Nadu Judo Association. All rights reserved.
      </div>
    </div>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: `"${SMTP_FROM_NAME}" <${SMTP_USER}>`,
    to: `"${toName}" <${toEmail}>`,
    subject: `Club Registration Received – Pending Approval`,
    html,
  });

  console.log(`[Mailer] Club registration receipt sent to ${toEmail}`);
}

export async function sendRegistrationReceiptEmail(opts: {
  toEmail: string;
  toName: string;
  role: string;
  tempId: string;
  password?: string;
}) {
  const { toEmail, toName, role, tempId, password } = opts;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap');
    body { margin:0; font-family:'Roboto',sans-serif; background:#f8fafc; color:#333; }
    .wrapper { padding: 40px 20px; }
    .container { max-width:600px; margin:auto; background:#fff; border-radius:16px; overflow:hidden;
                 box-shadow:0 8px 32px rgba(0,0,0,0.12); }
    .header { background:linear-gradient(135deg,#f97316 0%,#ea580c 100%);
              padding:36px 40px; text-align:center; }
    .header h1 { color:#fff; margin:0; font-size:22px; }
    .body { padding:36px 40px; }
    .body h2 { color:#ea580c; margin-top:0; }
    .body p  { color:#475569; line-height:1.7; }
    .status { display:inline-block; background:#fef3c7; color:#92400e;
              border-radius:999px; padding:4px 16px; font-weight:700; font-size:13px; }
    .footer { background:#f1f5f9; padding:20px 40px; text-align:center;
              border-top:1px solid #e2e8f0; color:#64748b; font-size:12px; }
    .temp-id-box { background:#fff7ed; border:1px solid #fed7aa; padding:16px; border-radius:8px; margin:20px 0; font-size:16px; text-align:center; }
    .temp-id-box strong { color:#9a3412; font-size:20px; display:block; margin-top:8px;}
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <h1>Tamil Nadu Judo Association</h1>
        <p style="color:#ffedd5; margin:6px 0 0;">Registration Received</p>
      </div>
      <div class="body">
        <h2>Hello ${toName},</h2>
        <p>Thank you for registering as a <strong>${role}</strong> with the Tamil Nadu Judo Association.</p>
        <p>Your application has been received and is currently <span class="status">PENDING APPROVAL</span>.</p>
        
        <div class="temp-id-box">
          Your Temporary ID for reference:
          <strong>${tempId}</strong>
          ${password ? `<br/><span style="font-size:14px; font-weight:normal;">Your Password: <strong>${password}</strong></span>` : ''}
          <div style="font-size:13px; font-weight:normal; margin-top:12px; color:#9a3412;">Use these credentials to log in and check your status or update your application if requested by the Admin.</div>
        </div>

        <p>Our team will review your application. Once approved, you will receive an email with your permanent ID and login credentials.</p>
        <p>Regards,<br/><strong>TNJA Admin Team</strong></p>
      </div>
      <div class="footer">
        © ${new Date().getFullYear()} Tamil Nadu Judo Association. All rights reserved.
      </div>
    </div>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: `"${SMTP_FROM_NAME}" <${SMTP_USER}>`,
    to: `"${toName}" <${toEmail}>`,
    subject: `TNJA Registration Received – Your Temporary ID`,
    html,
  });

  console.log(`[Mailer] Registration receipt sent to ${toEmail} with Temp ID: ${tempId}`);
}

export async function sendResetPasswordEmail(opts: {
  toEmail: string;
  toName: string;
  resetLink: string;
}) {
  const { toEmail, toName, resetLink } = opts;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap');
    body { margin:0; font-family:'Roboto',sans-serif; background:#f8fafc; color:#333; }
    .wrapper { padding: 40px 20px; }
    .container { max-width:600px; margin:auto; background:#fff; border-radius:16px; overflow:hidden;
                 box-shadow:0 8px 32px rgba(0,0,0,0.12); }
    .header { background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%);
              padding:36px 40px; text-align:center; }
    .header h1 { color:#fff; margin:0; font-size:22px; }
    .body { padding:36px 40px; }
    .body h2 { color:#1e3a8a; margin-top:0; }
    .body p  { color:#475569; line-height:1.7; }
    .button-container { text-align:center; margin:30px 0; }
    .button { background:#FF7400; color:#fff; padding:16px 32px; text-decoration:none;
              border-radius:8px; font-weight:700; font-size:16px; display:inline-block; }
    .footer { background:#f1f5f9; padding:20px 40px; text-align:center;
              border-top:1px solid #e2e8f0; color:#64748b; font-size:12px; }
    .warning { color:#ef4444; font-size:13px; margin-top:20px; font-style:italic; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <h1>Tamil Nadu Judo Association</h1>
        <p style="color:#bfdbfe; margin:6px 0 0;">Password Reset Request</p>
      </div>
      <div class="body">
        <h2>Hello ${toName},</h2>
        <p>You are receiving this email because we received a password reset request for your account on the TNJA Portal.</p>
        <p>Please click the button below to reset your password. This link will expire in <strong>1 hour</strong>.</p>
        
        <div class="button-container">
          <a href="${resetLink}" class="button">Reset Password</a>
        </div>

        <p>If you did not request a password reset, no further action is required.</p>
        <p class="warning">For your security, never share this link with anyone.</p>
        <p>Regards,<br/><strong>TNJA Admin Team</strong></p>
      </div>
      <div class="footer">
        © ${new Date().getFullYear()} Tamil Nadu Judo Association. All rights reserved.
      </div>
    </div>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: `"${SMTP_FROM_NAME}" <${SMTP_USER}>`,
    to: `"${toName}" <${toEmail}>`,
    subject: `Reset Your TNJA Account Password`,
    html,
  });

  console.log(`[Mailer] Password reset email sent to ${toEmail}`);
}

export async function sendEventRegistrationEmail(opts: {
  toEmail: string;
  toName: string;
  eventName: string;
  eventDate: string;
  eventLocation: string;
  amountPaid: number;
  paymentId: string;
}) {
  const { toEmail, toName, eventName, eventDate, eventLocation, amountPaid, paymentId } = opts;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap');
    body { margin:0; font-family:'Roboto',sans-serif; background:#f1f5f9; color:#333; }
    .wrapper { padding: 40px 20px; }
    .container { max-width:600px; margin:auto; background:#fff; border-radius:16px; overflow:hidden;
                 box-shadow:0 8px 32px rgba(0,0,0,0.12); }
    .header { background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);
              padding:36px 40px; text-align:center; }
    .header h1 { color:#fff; margin:0; font-size:22px; }
    .body { padding:36px 40px; }
    .body h2 { color:#0f172a; margin-top:0; }
    .body p  { color:#475569; line-height:1.7; }
    .receipt { background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px;
               padding:20px 24px; margin:24px 0; }
    .receipt table { width:100%; border-collapse:collapse; }
    .receipt td { padding:10px 0; border-bottom:1px solid #f1f5f9; font-size:15px; }
    .receipt td:first-child { font-weight:700; color:#0f172a; width:45%; }
    .receipt tr:last-child td { border-bottom:none; }
    .footer { background:#f8fafc; padding:20px 40px; text-align:center;
              border-top:1px solid #e2e8f0; color:#94a3b8; font-size:12px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <h1>Tamil Nadu Judo Association</h1>
        <p style="color:#94a3b8; margin:6px 0 0;">Event Application & Receipt</p>
      </div>
      <div class="body">
        <h2>Event Registration Successful!</h2>
        <p>Dear <strong>${toName}</strong>,</p>
        <p>Your registration for the event <strong>${eventName}</strong> has been successfully processed and approved.</p>
        <p>Here is your official payment receipt and registration details:</p>
        
        <div class="receipt">
          <table>
            <tr>
              <td>Event Name</td>
              <td>${eventName}</td>
            </tr>
            <tr>
              <td>Event Date</td>
              <td>${eventDate}</td>
            </tr>
            <tr>
              <td>Location</td>
              <td>${eventLocation}</td>
            </tr>
            <tr>
              <td>Amount Paid</td>
              <td><strong>₹ ${amountPaid}</strong></td>
            </tr>
            <tr>
              <td>Payment ID</td>
              <td><code>${paymentId}</code></td>
            </tr>
            <tr>
              <td>Registration Status</td>
              <td><span style="color:#16a34a; font-weight:bold;">APPROVED</span></td>
            </tr>
          </table>
        </div>

        <p>Thank you for your participation. We wish you the very best for the event!</p>
        <p>Regards,<br/><strong>TNJA Admin Team</strong></p>
      </div>
      <div class="footer">
        © ${new Date().getFullYear()} Tamil Nadu Judo Association. All rights reserved.
      </div>
    </div>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: `"${SMTP_FROM_NAME}" <${SMTP_USER}>`,
    to: `"${toName}" <${toEmail}>`,
    subject: `TNJA Event Registration & Receipt: ${eventName}`,
    html,
  });

  console.log(`[Mailer] Event registration receipt email sent to ${toEmail} for event ${eventName}`);
}

export async function sendNewTournamentAnnouncement(opts: {
  toEmail: string;
  toName: string;
  tournamentTitle: string;
  tournamentDate: string;
  tournamentLevel: string;
}) {
  const { toEmail, toName, tournamentTitle, tournamentDate, tournamentLevel } = opts;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap');
    body { margin:0; font-family:'Roboto',sans-serif; background:#f0f9ff; color:#333; }
    .wrapper { padding: 40px 20px; }
    .container { max-width:600px; margin:auto; background:#fff; border-radius:16px; overflow:hidden;
                 box-shadow:0 8px 32px rgba(0,0,0,0.18); }
    .header { background:linear-gradient(135deg,#ff7e5f 0%,#feb47b 100%);
              padding:36px 40px; text-align:center; }
    .header h1 { color:#fff; margin:0; font-size:24px; font-weight:900; letter-spacing: 1px; text-transform: uppercase;}
    .body { padding:36px 40px; }
    .body h2 { color:#ea580c; margin-top:0; }
    .body p  { color:#475569; line-height:1.7; }
    .tournament-card { background:#fff7ed; border:1px solid #fed7aa; border-radius:12px;
              padding:20px 24px; margin:24px 0; border-left: 5px solid #f97316; }
    .tournament-card table { width:100%; border-collapse:collapse; }
    .tournament-card td { padding:8px 0; font-size:15px; }
    .tournament-card td:first-child { font-weight:700; color:#9a3412; width:30%; }
    .footer { background:#f8fafc; padding:20px 40px; text-align:center;
              border-top:1px solid #e2e8f0; color:#94a3b8; font-size:12px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <h1>New Tournament Alert</h1>
      </div>
      <div class="body">
        <h2>Get Ready to Compete!</h2>
        <p>Dear <strong>${toName}</strong>,</p>
        <p>A brand new <strong>${tournamentLevel}</strong> level tournament has just been approved and is now open for registration!</p>
        
        <div class="tournament-card">
          <table>
            <tr>
              <td>Tournament</td>
              <td><strong>${tournamentTitle}</strong></td>
            </tr>
            <tr>
              <td>Date</td>
              <td><strong>${tournamentDate}</strong></td>
            </tr>
          </table>
        </div>

        <p>Log in to your TNJA Portal now to check the eligibility rules and secure your spot before registration closes.</p>
        <p>We look forward to seeing you on the tatami!</p>
        <p>Regards,<br/><strong>TNJA Admin Team</strong></p>
      </div>
      <div class="footer">
        © ${new Date().getFullYear()} Tamil Nadu Judo Association. All rights reserved.
      </div>
    </div>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: `"${SMTP_FROM_NAME}" <${SMTP_USER}>`,
    to: `"${toName}" <${toEmail}>`,
    subject: `New Tournament Announced: ${tournamentTitle}!`,
    html,
  });

  console.log(`[Mailer] New tournament announcement email sent to ${toEmail} for ${tournamentTitle}`);
}

export async function sendAadhaarVerificationEmail(toEmail: string, otp: string) {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap');
    body { margin:0; font-family:'Roboto',sans-serif; background:#f0f9ff; color:#333; }
    .wrapper { padding: 40px 20px; }
    .container { max-width:600px; margin:auto; background:#fff; border-radius:16px; overflow:hidden;
                 box-shadow:0 8px 32px rgba(0,0,0,0.18); }
    .header { background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%);
              padding:36px 40px; text-align:center; }
    .header h1 { color:#fff; margin:0; font-size:24px; font-weight:900; letter-spacing: 1px; }
    .body { padding:36px 40px; text-align:center; }
    .body h2 { color:#1e3a8a; margin-top:0; }
    .body p  { color:#475569; line-height:1.7; font-size:16px; }
    .otp-box { background:#f1f5f9; border:2px dashed #94a3b8; border-radius:12px;
               padding:24px; margin:32px auto; display:inline-block; letter-spacing: 4px;
               font-size:32px; font-weight:900; color:#0f172a; }
    .footer { background:#f8fafc; padding:20px 40px; text-align:center;
              border-top:1px solid #e2e8f0; color:#94a3b8; font-size:12px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <h1>Aadhaar Verification</h1>
      </div>
      <div class="body">
        <h2>Verify Your Email & Aadhaar</h2>
        <p>Please use the OTP below to verify your Aadhaar number and proceed with your registration.</p>
        
        <div class="otp-box">
          ${otp}
        </div>

        <p>This OTP is valid for the next 5 minutes. Do not share this code with anyone.</p>
      </div>
      <div class="footer">
        © ${new Date().getFullYear()} Tamil Nadu Judo Association. All rights reserved.
      </div>
    </div>
  </div>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from: `"${SMTP_FROM_NAME}" <${SMTP_USER}>`,
      to: toEmail,
      subject: `Your Aadhaar Verification OTP: ${otp}`,
      html,
    });
    console.log(`[Mailer] Aadhaar OTP sent to ${toEmail}`);
  } catch (error: any) {
    console.error(`[Mailer] Failed to send Aadhaar OTP to ${toEmail}:`, error.message);
    console.log(`[Mailer DEV MODE] Fallback - The OTP for ${toEmail} is: ${otp}`);
    // Swallowing the error so development is not blocked by email sending limits.
  }
}

export async function sendAccountDeletionEmail(opts: {
  toEmail: string;
  toName: string;
  role: string;
}) {
  const { toEmail, toName, role } = opts;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap');
    body { margin:0; font-family:'Roboto',sans-serif; background:#fef2f2; color:#333; }
    .wrapper { padding: 40px 20px; }
    .container { max-width:600px; margin:auto; background:#fff; border-radius:16px; overflow:hidden;
                 box-shadow:0 8px 32px rgba(0,0,0,0.12); }
    .header { background:linear-gradient(135deg,#991b1b 0%,#b91c1c 100%);
              padding:36px 40px; text-align:center; }
    .header h1 { color:#fff; margin:0; font-size:22px; }
    .body { padding:36px 40px; }
    .body h2 { color:#991b1b; margin-top:0; }
    .body p  { color:#475569; line-height:1.7; }
    .footer { background:#f1f5f9; padding:20px 40px; text-align:center;
              border-top:1px solid #e2e8f0; color:#64748b; font-size:12px; }
    .warning { color:#ef4444; font-size:13px; margin-top:20px; font-style:italic; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <h1>Tamil Nadu Judo Association</h1>
        <p style="color:#fecaca; margin:6px 0 0;">Account Deletion Notice</p>
      </div>
      <div class="body">
        <h2>Hello ${toName},</h2>
        <p>This email is to notify you that your <strong>${role}</strong> account has been deleted by an Administrator from the TNJA Portal.</p>
        <p>As a result, your login credentials will no longer work and you will not be able to access the portal.</p>
        <p>If you believe this was done in error or if you have any questions, please contact the TNJA state office immediately.</p>
        <p>Regards,<br/><strong>TNJA Admin Team</strong></p>
      </div>
      <div class="footer">
        © ${new Date().getFullYear()} Tamil Nadu Judo Association. All rights reserved.
      </div>
    </div>
  </div>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from: `"${SMTP_FROM_NAME}" <${SMTP_USER}>`,
      to: `"${toName}" <${toEmail}>`,
      subject: `Notice: Your TNJA Account has been Deleted`,
      html,
    });
    console.log(`[Mailer] Account deletion email sent to ${toEmail}`);
  } catch (err) {
    console.error(`[Mailer] Failed to send deletion email to ${toEmail}:`, err);
  }
}

