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

import { COMPANY } from "@/config/company";

/**
 * Pick list PDF (SPEC §11 — Phase 4 deliverable). One per order.
 *
 * Layout: A4 portrait. Header with order metadata, then a single
 * table — SKU | Description | Location | Qty. Sorted by warehouse
 * location for an efficient walking path (matches the on-screen
 * pick list).
 */

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottom: "1px solid #d1d5db",
    paddingBottom: 12,
    marginBottom: 16,
  },
  brand: { fontSize: 11, fontWeight: 700 },
  subtitle: { fontSize: 8, color: "#6b7280" },
  title: { fontSize: 18, fontWeight: 700 },
  orderNumber: { fontSize: 14, marginBottom: 2 },
  metaRow: { flexDirection: "row", paddingVertical: 2 },
  metaKey: { width: 70, color: "#6b7280", fontSize: 9 },
  metaVal: { fontSize: 10 },
  table: { marginTop: 8 },
  thead: {
    flexDirection: "row",
    borderBottom: "1px solid #d1d5db",
    paddingBottom: 4,
    marginBottom: 4,
    fontSize: 9,
    color: "#6b7280",
    fontWeight: 700,
  },
  row: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottom: "1px dotted #e5e7eb",
  },
  colSku: { width: 70, fontFamily: "Courier" },
  colName: { flex: 1, paddingRight: 8 },
  colLoc: { width: 110, fontFamily: "Courier" },
  colQty: { width: 40, textAlign: "right", fontFamily: "Courier" },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 32,
    right: 32,
    fontSize: 8,
    color: "#9ca3af",
    textAlign: "center",
  },
});

export type PickListData = {
  order_number: string;
  branch_code: string;
  branch_name: string;
  approved_at: string | null;
  notes: string | null;
  lines: Array<{
    sku: string;
    name: string;
    warehouse_location: string | null;
    quantity_approved: number;
  }>;
};

export async function renderPickListPdf(data: PickListData): Promise<Buffer> {
  const doc = (
    <Document
      title={`Pick list ${data.order_number}`}
      author={COMPANY.legal_name}
    >
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>{COMPANY.legal_name}</Text>
            <Text style={styles.subtitle}>Pick list</Text>
          </View>
          <View>
            <Text style={styles.orderNumber}>{data.order_number}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaKey}>Branch</Text>
              <Text style={styles.metaVal}>
                {data.branch_code} · {data.branch_name}
              </Text>
            </View>
            {data.approved_at ? (
              <View style={styles.metaRow}>
                <Text style={styles.metaKey}>Approved</Text>
                <Text style={styles.metaVal}>
                  {new Date(data.approved_at).toLocaleString("nl-NL", {
                    timeZone: "Europe/Amsterdam",
                  })}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.thead}>
            <Text style={styles.colSku}>SKU</Text>
            <Text style={styles.colName}>Description</Text>
            <Text style={styles.colLoc}>Location</Text>
            <Text style={styles.colQty}>Qty</Text>
          </View>
          {data.lines.map((line, i) => (
            <View key={i} style={styles.row} wrap={false}>
              <Text style={styles.colSku}>{line.sku}</Text>
              <Text style={styles.colName}>{line.name}</Text>
              <Text style={styles.colLoc}>
                {line.warehouse_location ?? "—"}
              </Text>
              <Text style={styles.colQty}>{line.quantity_approved}</Text>
            </View>
          ))}
        </View>

        {data.notes ? (
          <View style={{ marginTop: 16 }}>
            <Text style={{ fontSize: 9, color: "#6b7280" }}>Notes</Text>
            <Text style={{ fontSize: 10 }}>{data.notes}</Text>
          </View>
        ) : null}

        <Text style={styles.footer} fixed>
          {COMPANY.legal_name} · {data.order_number}
        </Text>
      </Page>
    </Document>
  );
  return await renderToBuffer(doc);
}
