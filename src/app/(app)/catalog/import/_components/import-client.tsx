"use client";

import Papa from "papaparse";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, FilePlus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  commitImport,
  previewImport,
  type PreviewResult,
  type PreviewRow,
} from "@/lib/actions/catalog-import";

const MAX_ROWS = 2000;

export function ImportClient() {
  const router = useRouter();
  const [fileName, setFileName] = useState<string | null>(null);
  const [rawRows, setRawRows] = useState<Record<string, unknown>[] | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState<
    | { tone: "success"; text: string }
    | { tone: "error"; text: string }
    | null
  >(null);
  const [isPending, startTransition] = useTransition();

  const onFile = async (file: File) => {
    setParseError(null);
    setPreview(null);
    setCommitMessage(null);
    setFileName(file.name);

    // Parse client-side so the user gets a fast preview; the server still
    // re-validates every row before committing.
    const text = await file.text();
    const parsed = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: true,
    });

    if (parsed.errors.length > 0) {
      const first = parsed.errors[0]!;
      setParseError(
        `CSV parse error on row ${first.row ?? "?"}: ${first.message}`,
      );
      return;
    }

    const rows = parsed.data ?? [];
    if (rows.length === 0) {
      setParseError("CSV has no data rows");
      return;
    }
    if (rows.length > MAX_ROWS) {
      setParseError(
        `CSV has ${rows.length} rows; the current limit is ${MAX_ROWS}`,
      );
      return;
    }
    setRawRows(rows);

    startTransition(async () => {
      const result = await previewImport(rows);
      if ("error" in result) {
        setParseError(result.error);
        setPreview(null);
        return;
      }
      setPreview(result);
    });
  };

  const onCommit = () => {
    if (!rawRows || !preview || preview.summary.errorCount > 0) return;
    startTransition(async () => {
      const result = await commitImport(rawRows);
      if ("error" in result) {
        setCommitMessage({ tone: "error", text: result.error });
        return;
      }
      setCommitMessage({
        tone: "success",
        text: `Imported — ${result.inserted} new, ${result.updated} updated`,
      });
      setPreview(null);
      setRawRows(null);
      setFileName(null);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      {/* File input */}
      <div className="rounded-lg bg-surface ring-1 ring-border p-5">
        <label
          htmlFor="csv-file"
          className="flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed border-border bg-surface-elevated/40 px-6 py-10 text-center transition-colors hover:border-border-strong hover:bg-surface-elevated"
        >
          <Upload className="h-6 w-6 text-fg-subtle" aria-hidden />
          <p className="text-sm text-fg">
            {fileName ?? "Choose a CSV file to upload"}
          </p>
          <p className="text-xs text-fg-subtle">
            Columns: sku, name, description, category_name, unit,
            unit_price_euro, vat_rate, min_order_qty, max_order_qty
          </p>
        </label>
        <input
          id="csv-file"
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFile(file);
          }}
        />
      </div>

      {parseError ? (
        <p role="alert" className="flex items-center gap-2 text-sm text-danger">
          <AlertCircle className="h-4 w-4" aria-hidden />
          {parseError}
        </p>
      ) : null}

      {commitMessage ? (
        <p
          role="status"
          className={cn(
            "flex items-center gap-2 text-sm",
            commitMessage.tone === "success" ? "text-success" : "text-danger",
          )}
        >
          {commitMessage.tone === "success" ? (
            <CheckCircle2 className="h-4 w-4" aria-hidden />
          ) : (
            <AlertCircle className="h-4 w-4" aria-hidden />
          )}
          {commitMessage.text}
        </p>
      ) : null}

      {/* Preview */}
      {preview ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-sm text-fg-muted">
              <span>
                <span className="font-numeric text-fg">{preview.summary.total}</span>{" "}
                rows
              </span>
              <span className="text-fg-subtle">·</span>
              <Badge variant="success" dot={false}>
                {preview.summary.newCount} new
              </Badge>
              <Badge variant="accent" dot={false}>
                {preview.summary.updateCount} update
              </Badge>
              {preview.summary.errorCount > 0 ? (
                <Badge variant="danger" dot={false}>
                  {preview.summary.errorCount} error
                </Badge>
              ) : null}
            </div>
            <Button
              type="button"
              onClick={onCommit}
              loading={isPending}
              disabled={
                preview.summary.errorCount > 0 ||
                preview.summary.newCount + preview.summary.updateCount === 0
              }
            >
              <FilePlus className="h-3.5 w-3.5" />
              Commit import
            </Button>
          </div>

          <div className="overflow-hidden rounded-lg ring-1 ring-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">#</TableHead>
                  <TableHead className="w-[110px]">Status</TableHead>
                  <TableHead className="w-[140px]">SKU</TableHead>
                  <TableHead>Name / error</TableHead>
                  <TableHead className="w-[120px] text-right">Price</TableHead>
                  <TableHead className="w-[80px] text-right">VAT</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.rows.map((r) => (
                  <PreviewRowView key={r.index} row={r} />
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      {isPending && !preview ? (
        <p className="text-sm text-fg-muted">Validating…</p>
      ) : null}
    </div>
  );
}

function PreviewRowView({ row }: { row: PreviewRow }) {
  if (row.status === "error") {
    return (
      <TableRow>
        <TableCell className="font-numeric text-fg-muted">
          {row.index + 1}
        </TableCell>
        <TableCell>
          <Badge variant="danger" dot={false}>
            Error
          </Badge>
        </TableCell>
        <TableCell className="font-numeric text-fg-muted">
          {row.sku ?? "—"}
        </TableCell>
        <TableCell colSpan={3}>
          <ul className="space-y-0.5">
            {row.errors.map((e, i) => (
              <li key={i} className="text-xs text-danger">
                {e}
              </li>
            ))}
          </ul>
        </TableCell>
      </TableRow>
    );
  }

  const price = (row.data.unit_price_cents / 100).toFixed(2);
  return (
    <TableRow>
      <TableCell className="font-numeric text-fg-muted">
        {row.index + 1}
      </TableCell>
      <TableCell>
        <Badge
          variant={row.status === "new" ? "success" : "accent"}
          dot={false}
        >
          {row.status === "new" ? "New" : "Update"}
        </Badge>
      </TableCell>
      <TableCell className="font-numeric">{row.sku}</TableCell>
      <TableCell className="truncate">{row.data.name}</TableCell>
      <TableCell numeric>€{price}</TableCell>
      <TableCell numeric className="text-fg-muted">
        {row.data.vat_rate}%
      </TableCell>
    </TableRow>
  );
}
