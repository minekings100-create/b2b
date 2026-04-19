/**
 * Central company config (SPEC §11, 3.3.3a).
 *
 * Single source of truth for every place we render company identity:
 * email footers, /privacy, /cookies, legal boilerplate, the unsubscribe
 * confirmation page, the app's public-facing chrome.
 *
 * NEVER hardcode company data elsewhere. Swapping a field later must be
 * a one-file edit here.
 *
 * Fields tagged `[PLACEHOLDER]` require real values before production
 * launch. They are listed in docs/CHANGELOG.md under "pre-production
 * fill-ins" so the handover checklist catches them.
 */

export type CompanyConfig = {
  /** Legal entity name for email footers, /privacy, /cookies, contracts. */
  legal_name: string;
  /** Kamer van Koophandel (Dutch chamber of commerce) registration number. */
  kvk: string;
  /** BTW / VAT number (NL format: NL123456789B01). */
  btw_number: string;
  /** Visiting (walk-in) address, rendered as-is in footers / legal pages. */
  visiting_address: string;
  /** Postal address if different from visiting; otherwise same string. */
  postal_address: string;
  /** Main contact phone — E.164-style recommended. */
  phone: string;
  /** Primary inbound contact for users (footer "Contact us" links here). */
  support_email: string;
  /** Public marketing site (NOT the internal procurement URL). */
  website_url: string;
};

export const COMPANY: CompanyConfig = {
  legal_name: "Bessems Marketing Service B.V.",
  kvk: "[PLACEHOLDER]",
  btw_number: "[PLACEHOLDER]",
  visiting_address: "[PLACEHOLDER]",
  postal_address: "[PLACEHOLDER]",
  phone: "[PLACEHOLDER]",
  support_email: "info@bessemsmarketingservice.nl",
  website_url: "https://bessemsmarketingservice.nl",
};

/**
 * True when a value is still a `[PLACEHOLDER]`. Useful for dev-only
 * warnings, build-time assertions, or a pre-launch "are we ready?"
 * checklist. Not used by rendering — placeholders render as-is so the
 * gap is obvious in preview.
 */
export function isPlaceholder(value: string): boolean {
  return value === "[PLACEHOLDER]";
}
