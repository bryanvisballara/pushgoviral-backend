function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderCodeEmail({ firstName, code, expiresMinutes, title, subtitle, ctaLabel, accentColor }) {
  const safeName = escapeHtml(firstName || "there");
  const safeCode = escapeHtml(code);
  const safeTitle = escapeHtml(title);
  const safeSubtitle = escapeHtml(subtitle);
  const safeCtaLabel = escapeHtml(ctaLabel);
  const safeAccent = escapeHtml(accentColor || "#00c2a8");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${safeTitle}</title>
  </head>
  <body style="margin:0;padding:0;background:#0b1320;font-family:'Segoe UI',Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b1320;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#101a2b;border-radius:18px;overflow:hidden;border:1px solid #1d2a43;">
            <tr>
              <td style="padding:28px 28px 16px;background:linear-gradient(140deg,#08101f 0%,#13203a 55%,#0a1b24 100%);">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      <img src="https://pushgoviral.com/assets/logopushgo.png" alt="PushGo Viral" width="150" style="display:block;border:0;outline:none;text-decoration:none;max-width:150px;" />
                    </td>
                    <td align="right" style="vertical-align:middle;">
                      <span style="display:inline-block;padding:6px 12px;border-radius:999px;background:${safeAccent};color:#041016;font-size:12px;font-weight:700;letter-spacing:.4px;">SECURE CODE</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:26px 28px 8px;">
                <p style="margin:0 0 10px;color:#9db0cf;font-size:14px;line-height:1.5;">Hi ${safeName},</p>
                <h1 style="margin:0;color:#f5f8ff;font-size:28px;line-height:1.2;letter-spacing:-0.3px;">${safeTitle}</h1>
                <p style="margin:12px 0 0;color:#b9c7df;font-size:15px;line-height:1.65;">${safeSubtitle}</p>
              </td>
            </tr>

            <tr>
              <td style="padding:22px 28px 12px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b1423;border:1px solid #273956;border-radius:14px;">
                  <tr>
                    <td align="center" style="padding:22px 16px 18px;">
                      <p style="margin:0 0 8px;color:#9bb1d1;font-size:12px;letter-spacing:1px;text-transform:uppercase;">${safeCtaLabel}</p>
                      <p style="margin:0;color:#ffffff;font-size:40px;font-weight:800;letter-spacing:8px;line-height:1;">${safeCode}</p>
                      <p style="margin:12px 0 0;color:#8da5c8;font-size:13px;">Expires in ${Number(expiresMinutes || 10)} minutes</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:8px 28px 30px;">
                <p style="margin:0;color:#9fb3d1;font-size:13px;line-height:1.6;">If you did not request this code, you can safely ignore this email. For security, never share this code with anyone.</p>
              </td>
            </tr>

            <tr>
              <td style="padding:16px 28px 24px;border-top:1px solid #21314d;background:#0d1728;">
                <p style="margin:0;color:#7f95b9;font-size:12px;line-height:1.6;">PushGo Viral | <a href="https://pushgoviral.com" style="color:#98d8ff;text-decoration:none;">pushgoviral.com</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderVerificationEmail({ firstName, code, expiresMinutes }) {
  return renderCodeEmail({
    firstName,
    code,
    expiresMinutes,
    title: "Verify Your PushGo Viral Account",
    subtitle: "Use this 6-digit verification code to confirm your email and activate your account.",
    ctaLabel: "Verification Code",
    accentColor: "#00c2a8",
  });
}

function renderPasswordResetEmail({ firstName, code, expiresMinutes }) {
  return renderCodeEmail({
    firstName,
    code,
    expiresMinutes,
    title: "Reset Your PushGo Viral Password",
    subtitle: "Use this 6-digit code to reset your password and recover access to your account.",
    ctaLabel: "Reset Code",
    accentColor: "#3ec2ff",
  });
}

module.exports = {
  renderVerificationEmail,
  renderPasswordResetEmail,
};
