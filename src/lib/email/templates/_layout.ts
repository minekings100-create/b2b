import "server-only";

import { COMPANY } from "@/config/company";

/**
 * Minimal HTML wrapper for 3.3.x emails. Polished branded layout
 * (logo, responsive table grid, per-template hero) lands in 3.3.3b
 * — keep THIS file boring on purpose so 3.3.3b's review can churn
 * the visual layer without having to relitigate preference plumbing.
 *
 * 3.3.3a adds a small legal + opt-out footer: company name, manage-
 * preferences link, unsubscribe link. The unsubscribe and prefs links
 * embed `{{UNSUBSCRIBE_URL}}` / `{{PREFS_URL}}` placeholders that
 * `notify()` replaces per recipient — the template layer stays pure
 * (no recipient state leaks in) and the one-render-per-trigger
 * optimization is preserved.
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
<hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0 12px;" />
<p style="margin:0 0 6px;font-size:12px;color:#71717a;"><strong>${escapeHtml(COMPANY.legal_name)}</strong> · Internal procurement platform</p>
<p style="margin:0;font-size:11px;color:#9ca3af;"><a href="{{PREFS_URL}}" style="color:#9ca3af;text-decoration:underline;">Manage email preferences</a> · <a href="{{UNSUBSCRIBE_URL}}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a></p>
</div>
</body>
</html>`;
}

/**
 * Plaintext footer. Appended by `notify()` per recipient (not by the
 * templates themselves) so a zero-change footer update doesn't
 * require touching all 10 render functions. Placeholders are replaced
 * per recipient by `notify()`.
 */
export function textFooter(): string {
  return [
    "—",
    `${COMPANY.legal_name} · Internal procurement platform`,
    "",
    "Manage preferences: {{PREFS_URL}}",
    "Unsubscribe: {{UNSUBSCRIBE_URL}}",
  ].join("\n");
}

export const escape = escapeHtml;
