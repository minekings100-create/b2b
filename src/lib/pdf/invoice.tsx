import "server-only";

import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import * as React from "react";

import { COMPANY, isPlaceholder } from "@/config/company";

/**
 * Phase 5 — invoice PDF.
 *
 * A4 portrait, light-mode only (SPEC §4: "PDF invoices [...] fixed
 * light-mode, print-safe"). Masthead with the company legal block,
 * bill-to (branch), invoice number + issue date + due date, lines
 * table (SKU·name / qty / unit / VAT / line net / line total), totals.
 */

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica" },
  brandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 18,
  },
  brandCol: { flexDirection: "column" },
  brandName: { fontSize: 13, fontWeight: 700 },
  brandLine: { fontSize: 9, color: "#4b5563" },
  docBlock: {
    alignItems: "flex-end",
    borderLeft: "2px solid #0f172a",
    paddingLeft: 12,
  },
  docTitle: { fontSize: 16, fontWeight: 700, letterSpacing: 1 },
  docNumber: { fontSize: 11, marginTop: 2, fontFamily: "Courier" },
  addressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  addressCard: {
    flex: 1,
    padding: 10,
    borderRadius: 4,
    backgroundColor: "#f8fafc",
    marginRight: 8,
  },
  addressCardLast: { marginRight: 0, marginLeft: 8 },
  cardTitle: {
    fontSize: 8,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  metaTable: { marginBottom: 14 },
  metaRow: { flexDirection: "row", paddingVertical: 2 },
  metaKey: { width: 90, color: "#6b7280", fontSize: 9 },
  metaVal: { fontSize: 10 },
  table: { marginTop: 6 },
  thead: {
    flexDirection: "row",
    borderBottom: "1px solid #0f172a",
    paddingBottom: 4,
    marginBottom: 4,
    fontSize: 8,
    color: "#4b5563",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  row: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottom: "1px dotted #e5e7eb",
  },
  colDesc: { flex: 1, paddingRight: 8 },
  colQty: { width: 40, textAlign: "right", fontFamily: "Courier" },
  colUnit: { width: 60, textAlign: "right", fontFamily: "Courier" },
  colVat: { width: 40, textAlign: "right", fontFamily: "Courier" },
  colNet: { width: 60, textAlign: "right", fontFamily: "Courier" },
  colGross: { width: 70, textAlign: "right", fontFamily: "Courier" },
  totalsRow: { flexDirection: "row", marginTop: 14, justifyContent: "flex-end" },
  totalsBox: { width: 220 },
  totalsLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  totalsLabel: { fontSize: 10, color: "#4b5563" },
  totalsValue: { fontSize: 10, fontFamily: "Courier" },
  totalsGross: {
    fontSize: 12,
    fontWeight: 700,
    fontFamily: "Courier",
  },
  totalsGrossRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    marginTop: 4,
    borderTop: "1px solid #0f172a",
  },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 36,
    right: 36,
    fontSize: 8,
    color: "#9ca3af",
    textAlign: "center",
  },
});

const eur = (cents: number) =>
  new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);

const ddmmyyyy = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("nl-NL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "Europe/Amsterdam",
      })
    : "—";

export type InvoicePdfData = {
  invoice_number: string;
  issued_at: string | null;
  due_at: string | null;
  branch_code: string;
  branch_name: string;
  order_number: string | null;
  lines: Array<{
    description: string;
    quantity: number;
    unit_price_cents: number;
    vat_rate: number;
    line_net_cents: number;
    line_vat_cents: number;
  }>;
  total_net_cents: number;
  total_vat_cents: number;
  total_gross_cents: number;
  status: string;
};

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  const doc = (
    <Document title={`Invoice ${data.invoice_number}`} author={COMPANY.legal_name}>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.brandRow}>
          <View style={styles.brandCol}>
            <Text style={styles.brandName}>{COMPANY.legal_name}</Text>
            {!isPlaceholder(COMPANY.visiting_address) ? (
              <Text style={styles.brandLine}>{COMPANY.visiting_address}</Text>
            ) : null}
            {!isPlaceholder(COMPANY.kvk) ? (
              <Text style={styles.brandLine}>KvK {COMPANY.kvk}</Text>
            ) : null}
            {!isPlaceholder(COMPANY.btw_number) ? (
              <Text style={styles.brandLine}>BTW {COMPANY.btw_number}</Text>
            ) : null}
            {!isPlaceholder(COMPANY.phone) ? (
              <Text style={styles.brandLine}>{COMPANY.phone}</Text>
            ) : null}
            <Text style={styles.brandLine}>{COMPANY.support_email}</Text>
          </View>
          <View style={styles.docBlock}>
            <Text style={styles.docTitle}>INVOICE</Text>
            <Text style={styles.docNumber}>{data.invoice_number}</Text>
          </View>
        </View>

        <View style={styles.addressRow}>
          <View style={styles.addressCard}>
            <Text style={styles.cardTitle}>Bill to</Text>
            <Text style={{ fontWeight: 700 }}>{data.branch_name}</Text>
            <Text style={{ color: "#4b5563" }}>Branch {data.branch_code}</Text>
            {data.order_number ? (
              <Text style={{ color: "#4b5563", marginTop: 4 }}>
                Order {data.order_number}
              </Text>
            ) : null}
          </View>
          <View style={[styles.addressCard, styles.addressCardLast]}>
            <Text style={styles.cardTitle}>Dates</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaKey}>Issued</Text>
              <Text style={styles.metaVal}>{ddmmyyyy(data.issued_at)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaKey}>Due</Text>
              <Text style={styles.metaVal}>{ddmmyyyy(data.due_at)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaKey}>Status</Text>
              <Text style={styles.metaVal}>{data.status.toUpperCase()}</Text>
            </View>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.thead}>
            <Text style={styles.colDesc}>Description</Text>
            <Text style={styles.colQty}>Qty</Text>
            <Text style={styles.colUnit}>Unit</Text>
            <Text style={styles.colVat}>VAT</Text>
            <Text style={styles.colNet}>Net</Text>
            <Text style={styles.colGross}>Gross</Text>
          </View>
          {data.lines.map((line, i) => (
            <View key={i} style={styles.row} wrap={false}>
              <Text style={styles.colDesc}>{line.description}</Text>
              <Text style={styles.colQty}>{line.quantity}</Text>
              <Text style={styles.colUnit}>{eur(line.unit_price_cents)}</Text>
              <Text style={styles.colVat}>{line.vat_rate}%</Text>
              <Text style={styles.colNet}>{eur(line.line_net_cents)}</Text>
              <Text style={styles.colGross}>
                {eur(line.line_net_cents + line.line_vat_cents)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsRow}>
          <View style={styles.totalsBox}>
            <View style={styles.totalsLine}>
              <Text style={styles.totalsLabel}>Subtotal (net)</Text>
              <Text style={styles.totalsValue}>
                {eur(data.total_net_cents)}
              </Text>
            </View>
            <View style={styles.totalsLine}>
              <Text style={styles.totalsLabel}>VAT</Text>
              <Text style={styles.totalsValue}>
                {eur(data.total_vat_cents)}
              </Text>
            </View>
            <View style={styles.totalsGrossRow}>
              <Text style={[styles.totalsLabel, { fontWeight: 700 }]}>
                Total
              </Text>
              <Text style={styles.totalsGross}>
                {eur(data.total_gross_cents)}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.footer} fixed>
          {COMPANY.legal_name} · {data.invoice_number}
        </Text>
      </Page>
    </Document>
  );
  return await renderToBuffer(doc);
}
