import "server-only";

import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import * as React from "react";
import QRCode from "qrcode";

import { COMPANY } from "@/config/company";

/**
 * Pallet label PDF (SPEC §8.3 step 7). One label per closed pallet.
 *
 * Layout: A6 portrait — fits a thermal label printer or quartered A4.
 * Top: company strap + pallet number + QR (encodes the pallet UUID so
 * a phone scan in the receiving branch resolves to a unique row).
 * Bottom: order + branch metadata, item count, packed-by/at.
 */

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 10, fontFamily: "Helvetica" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottom: "1px solid #d1d5db",
    paddingBottom: 8,
    marginBottom: 12,
  },
  brandWrap: { flexDirection: "column" },
  brand: { fontSize: 11, fontWeight: 700 },
  subtitle: { fontSize: 8, color: "#6b7280" },
  qrWrap: { width: 96, height: 96 },
  palletNumber: { fontSize: 22, fontWeight: 700, marginBottom: 4 },
  metaTable: { marginTop: 8 },
  metaRow: { flexDirection: "row", paddingVertical: 3 },
  metaKey: { width: 90, color: "#6b7280", fontSize: 9 },
  metaVal: { flex: 1, fontSize: 10 },
  bigVal: { fontSize: 14, fontWeight: 700 },
  footer: {
    marginTop: 16,
    fontSize: 8,
    color: "#9ca3af",
    textAlign: "center",
  },
});

export type PalletLabelData = {
  pallet_number: string;
  pallet_id: string;
  order_number: string;
  branch_code: string;
  branch_name: string;
  item_count: number;
  packed_by_email: string | null;
  packed_at: string | null;
};

export async function renderPalletLabelPdf(
  data: PalletLabelData,
): Promise<Buffer> {
  const qr = await QRCode.toDataURL(data.pallet_id, {
    margin: 0,
    width: 200,
    errorCorrectionLevel: "M",
  });

  const doc = (
    <Document
      title={`Pallet ${data.pallet_number}`}
      author={COMPANY.legal_name}
    >
      <Page size="A6" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.brandWrap}>
            <Text style={styles.brand}>{COMPANY.legal_name}</Text>
            <Text style={styles.subtitle}>Internal procurement</Text>
            <Text style={styles.palletNumber}>{data.pallet_number}</Text>
          </View>
          <Image src={qr} style={styles.qrWrap} />
        </View>

        <View style={styles.metaTable}>
          <View style={styles.metaRow}>
            <Text style={styles.metaKey}>Order</Text>
            <Text style={[styles.metaVal, styles.bigVal]}>
              {data.order_number}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaKey}>Branch</Text>
            <Text style={styles.metaVal}>
              {data.branch_code} · {data.branch_name}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaKey}>Lines</Text>
            <Text style={styles.metaVal}>{data.item_count}</Text>
          </View>
          {data.packed_by_email ? (
            <View style={styles.metaRow}>
              <Text style={styles.metaKey}>Packed by</Text>
              <Text style={styles.metaVal}>{data.packed_by_email}</Text>
            </View>
          ) : null}
          {data.packed_at ? (
            <View style={styles.metaRow}>
              <Text style={styles.metaKey}>Packed at</Text>
              <Text style={styles.metaVal}>
                {new Date(data.packed_at).toLocaleString("nl-NL", {
                  timeZone: "Europe/Amsterdam",
                })}
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.footer}>{data.pallet_number}</Text>
      </Page>
    </Document>
  );

  return await renderToBuffer(doc);
}
