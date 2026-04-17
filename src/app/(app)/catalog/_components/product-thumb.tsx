import { Box } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Fixed-size product thumbnail used in the catalog table. Renders a
 * placeholder with a muted zinc fill when no image is set.
 */
export function ProductThumb({
  src,
  alt,
  size = 40,
  className,
}: {
  src: string | null;
  alt: string;
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-md bg-surface-elevated ring-1 ring-inset ring-border",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden={!src}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <Box className="h-4 w-4 text-fg-subtle" aria-hidden />
      )}
    </div>
  );
}
