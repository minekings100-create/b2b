"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import type { CatalogCategory } from "@/lib/db/catalog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function isTypingInEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * Controls the URL params that drive the server-side query:
 *   ?q=<term>&cat=<uuid>&stock=1&page=<n>
 *
 * Search uses a 250ms debounce so typing feels responsive but we don't
 * reload the list on every keystroke. Category + stock toggle commit
 * immediately.
 */
export function CatalogFilters({
  categories,
}: {
  categories: CatalogCategory[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const initial = params.get("q") ?? "";
  const [q, setQ] = useState(initial);
  const [isMac, setIsMac] = useState<boolean | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad|iPod/i.test(navigator.userAgent));
  }, []);

  // Keep local state in sync with URL when server re-renders (e.g. page nav).
  useEffect(() => {
    setQ(params.get("q") ?? "");
  }, [params]);

  // Keyboard shortcuts scoped to /catalog:
  //   Ctrl/Cmd+F → focus search (preventDefault so browser find doesn't open)
  //   /          → focus search (only when not already in another input)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (e.key === "/" && !isTypingInEditable(e.target)) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const currentCategory = params.get("cat") ?? "";
  const inStockOnly = params.get("stock") === "1";

  const writeParams = useMemo(
    () =>
      (mutate: (p: URLSearchParams) => void) => {
        const next = new URLSearchParams(params.toString());
        mutate(next);
        // Any filter change resets pagination.
        next.delete("page");
        const qs = next.toString();
        startTransition(() => {
          router.replace(qs ? `/catalog?${qs}` : "/catalog");
        });
      },
    [params, router],
  );

  const onSearchChange = (value: string) => {
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      writeParams((p) => {
        if (value.trim()) p.set("q", value.trim());
        else p.delete("q");
      });
    }, 250);
  };

  const onCategoryChange = (id: string) => {
    writeParams((p) => {
      if (id) p.set("cat", id);
      else p.delete("cat");
    });
  };

  const toggleInStock = () => {
    writeParams((p) => {
      if (inStockOnly) p.delete("stock");
      else p.set("stock", "1");
    });
  };

  const clearAll = () => {
    writeParams((p) => {
      p.delete("q");
      p.delete("cat");
      p.delete("stock");
    });
    setQ("");
  };

  const hasActive = q || currentCategory || inStockOnly;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-b border-border bg-surface px-gutter py-3",
        pending && "opacity-70",
      )}
    >
      <div className="relative min-w-[220px] flex-1">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle"
          aria-hidden
        />
        <Input
          ref={searchRef}
          value={q}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={
            isMac
              ? "Search SKU or name  (⌘F)"
              : isMac === false
                ? "Search SKU or name  (Ctrl+F)"
                : "Search SKU or name"
          }
          aria-label="Search catalog"
          className="h-8 pl-8"
        />
      </div>

      <label className="sr-only" htmlFor="catalog-category">
        Category
      </label>
      <select
        id="catalog-category"
        value={currentCategory}
        onChange={(e) => onCategoryChange(e.target.value)}
        className="h-8 rounded-md bg-surface px-2 text-sm text-fg ring-1 ring-inset ring-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
      >
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <label className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm text-fg-muted select-none">
        <input
          type="checkbox"
          checked={inStockOnly}
          onChange={toggleInStock}
          className="h-4 w-4 rounded border-border accent-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
          aria-label="In stock only"
        />
        <span>In stock only</span>
      </label>

      {hasActive ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clearAll}
          aria-label="Clear filters"
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </Button>
      ) : null}
    </div>
  );
}
