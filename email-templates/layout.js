function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

function renderDetailRow(label, value) {
  const safeLabel = escapeHtml(label);
  const safeValue = escapeHtml(value || "-");

  return `<tr>
    <td class="detail-label" style="padding:10px 0;color:#8da5c8;font-size:13px;font-weight:600;width:38%;vertical-align:top;border-bottom:1px solid #1e2d47;">${safeLabel}</td>
    <td class="detail-value" style="padding:10px 0;color:#f0f5ff;font-size:14px;font-weight:500;vertical-align:top;border-bottom:1px solid #1e2d47;word-break:break-word;">${safeValue}</td>
  </tr>`;
}

function renderEmailLayout({ badgeLabel, badgeColor, title, subtitle, bodyHtml, accentColor }) {
  const safeBadge = escapeHtml(badgeLabel);
  const safeTitle = escapeHtml(title);
  const safeSubtitle = escapeHtml(subtitle);
  const safeAccent = escapeHtml(accentColor || "#00c2a8");

  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <title>${safeTitle}</title>
    <style>
      :root { color-scheme: light dark; }
      body, table, td, p, h1, span, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
      @media (prefers-color-scheme: dark) {
        .email-bg { background-color: #0b1320 !important; }
        .email-card { background-color: #101a2b !important; border-color: #1d2a43 !important; }
        .email-header { background: linear-gradient(140deg,#08101f 0%,#13203a 55%,#0a1b24 100%) !important; }
        .email-title { color: #f5f8ff !important; }
        .email-subtitle { color: #b9c7df !important; }
        .detail-panel { background-color: #0b1423 !important; border-color: #273956 !important; }
        .detail-label { color: #8da5c8 !important; border-bottom-color: #1e2d47 !important; }
        .detail-value { color: #f0f5ff !important; border-bottom-color: #1e2d47 !important; }
        .email-footer { background-color: #0d1728 !important; border-top-color: #21314d !important; }
        .email-footer-text { color: #7f95b9 !important; }
      }
      @media (prefers-color-scheme: light) {
        .email-bg { background-color: #eef3fa !important; }
        .email-card { background-color: #ffffff !important; border-color: #d8e3f2 !important; }
        .email-header { background: linear-gradient(140deg,#f7fbff 0%,#edf4ff 55%,#e8f7f4 100%) !important; }
        .email-title { color: #0f1b2d !important; }
        .email-subtitle { color: #4a5d78 !important; }
        .detail-panel { background-color: #f7faff !important; border-color: #d8e3f2 !important; }
        .detail-label { color: #5f7390 !important; border-bottom-color: #e2eaf5 !important; }
        .detail-value { color: #102033 !important; border-bottom-color: #e2eaf5 !important; }
        .email-footer { background-color: #f4f8fd !important; border-top-color: #dce6f3 !important; }
        .email-footer-text { color: #6a7f9b !important; }
      }
    </style>
  </head>
  <body class="email-bg" style="margin:0;padding:0;background:#0b1320;font-family:'Segoe UI',Arial,sans-serif;">
    <table role="presentation" class="email-bg" width="100%" cellspacing="0" cellpadding="0" style="background:#0b1320;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" class="email-card" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#101a2b;border-radius:18px;overflow:hidden;border:1px solid #1d2a43;">
            <tr>
              <td class="email-header" style="padding:28px 28px 16px;background:linear-gradient(140deg,#08101f 0%,#13203a 55%,#0a1b24 100%);">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      <img src="https://pushgoviral.com/assets/logopushgo.png" alt="PushGo Viral" width="150" style="display:block;border:0;outline:none;text-decoration:none;max-width:150px;" />
                    </td>
                    <td align="right" style="vertical-align:middle;">
                      <span style="display:inline-block;padding:6px 12px;border-radius:999px;background:${safeAccent};color:#041016;font-size:12px;font-weight:700;letter-spacing:.4px;">${safeBadge}</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:26px 28px 8px;">
                <h1 class="email-title" style="margin:0;color:#f5f8ff;font-size:26px;line-height:1.25;letter-spacing:-0.3px;">${safeTitle}</h1>
                <p class="email-subtitle" style="margin:12px 0 0;color:#b9c7df;font-size:15px;line-height:1.65;">${safeSubtitle}</p>
              </td>
            </tr>

            <tr>
              <td style="padding:12px 28px 24px;">
                ${bodyHtml}
              </td>
            </tr>

            <tr>
              <td class="email-footer" style="padding:16px 28px 24px;border-top:1px solid #21314d;background:#0d1728;">
                <p class="email-footer-text" style="margin:0;color:#7f95b9;font-size:12px;line-height:1.6;">PushGo Viral internal notification | <a href="https://pushgoviral.com" style="color:#98d8ff;text-decoration:none;">pushgoviral.com</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderDetailsPanel(rows) {
  const rowsHtml = rows.map(([label, value]) => renderDetailRow(label, value)).join("");

  return `<table role="presentation" class="detail-panel" width="100%" cellspacing="0" cellpadding="0" style="background:#0b1423;border:1px solid #273956;border-radius:14px;">
    <tr>
      <td style="padding:18px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          ${rowsHtml}
        </table>
      </td>
    </tr>
  </table>`;
}

module.exports = {
  escapeHtml,
  formatDateTime,
  renderEmailLayout,
  renderDetailsPanel,
};
