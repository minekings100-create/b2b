import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

/**
 * Phase 7b-2c — minimal from/to date picker for reports. GET form; no
 * client JS needed. The enclosing page re-renders on submit because
 * the form posts to the same route.
 */
export function WindowPicker({
  from,
  to,
  csvHref,
}: {
  from: string;
  to: string;
  csvHref?: string;
}) {
  return (
    <form
      method="get"
      className="flex flex-wrap items-end gap-3 rounded-lg bg-surface p-4 ring-1 ring-border"
      aria-label="Report date window"
    >
      <div>
        <Label htmlFor="r-from">From</Label>
        <Input
          id="r-from"
          name="from"
          type="date"
          defaultValue={from}
          className="mt-1.5 font-numeric"
        />
      </div>
      <div>
        <Label htmlFor="r-to">To</Label>
        <Input
          id="r-to"
          name="to"
          type="date"
          defaultValue={to}
          className="mt-1.5 font-numeric"
        />
      </div>
      <Button type="submit">Apply</Button>
      {csvHref ? (
        <a
          href={csvHref}
          className="ml-auto inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium text-fg-muted ring-1 ring-border hover:text-fg hover:bg-surface-elevated"
          download
        >
          Download CSV
        </a>
      ) : null}
    </form>
  );
}
