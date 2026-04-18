import "server-only";

/**
 * Minimal HTML wrapper for sub-milestone 3.3.1 emails. Polished branded
 * layout (logo, footer, unsubscribe, responsive table grid) lands in 3.3.3
 * — keep this file boring on purpose so 3.3.3's review doesn't churn this
 * file and the trigger wiring at the same time.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function htmlLayout(opts: {
  preheader: string;
  bodyHtml: string;
  ctaUrl?: string;
  ctaLabel?: string;
}): string {
  const { preheader, bodyHtml, ctaUrl, ctaLabel } = opts;
  const cta =
    ctaUrl && ctaLabel
      ? `<p style="margin:24px 0;"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:10px 16px;background:#4f46e5;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;">${escapeHtml(ctaLabel)}</a></p>`
      : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(preheader)}</title>
</head>
<body style="margin:0;padding:24px;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;color:#18181b;">
<span style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${escapeHtml(preheader)}</span>
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px;font-size:14px;line-height:1.5;">
${bodyHtml}
${cta}
<hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0 16px;" />
<p style="margin:0;font-size:12px;color:#71717a;">Bessems Marketing Service · Internal procurement platform</p>
</div>
</body>
</html>`;
}

export const escape = escapeHtml;
