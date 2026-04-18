"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/dates/format";
import { markNotificationsRead } from "@/lib/actions/notifications";
import type {
  NotificationCard,
  NotificationsSnapshot,
} from "@/lib/db/notifications";

/**
 * Bell + badge + dropdown (3.3.2). All state is client-side; the
 * server-component wrapper seeds `initial` on first paint to avoid an
 * empty-state flash before the first poll lands.
 *
 * Polling: every 30s, but only while the tab is visible. SPEC §10
 * explicitly defers real-time push, so a tighter cadence here would be
 * overkill — 30s is a reasonable trade between freshness and DB load
 * (~2 reqs/min × concurrent users).
 *
 * Dropdown is a simple absolute-positioned panel with click-outside +
 * Escape to close. No new dep — Radix popover would be overkill for a
 * single dropdown.
 */
export function NotificationsBellClient({
  initial,
}: {
  initial: NotificationsSnapshot;
}) {
  const router = useRouter();
  const [snapshot, setSnapshot] =
    React.useState<NotificationsSnapshot>(initial);
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const refresh = React.useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/me", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as NotificationsSnapshot;
      setSnapshot(data);
    } catch {
      // Network blip — leave the previous snapshot in place. The next
      // poll will recover.
    }
  }, []);

  // 30s poll, paused when the tab is hidden. Re-fires immediately on
  // visibility change so the user gets fresh state right after focus.
  React.useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (id !== null) return;
      id = setInterval(refresh, 30_000);
    };
    const stop = () => {
      if (id === null) return;
      clearInterval(id);
      id = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh();
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === "visible") {
      // Fire once on mount so the badge populates immediately —
      // the server wrapper renders with an empty snapshot to avoid
      // adding latency to every authenticated page render.
      refresh();
      start();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  // Click-outside + Escape to close.
  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onClickItem = async (n: NotificationCard) => {
    setOpen(false);
    if (!n.read_at) {
      // Optimistic local update so the dot disappears immediately.
      setSnapshot((s) => ({
        unread_count: Math.max(0, s.unread_count - 1),
        recent: s.recent.map((r) =>
          r.id === n.id ? { ...r, read_at: new Date().toISOString() } : r,
        ),
      }));
      const fd = new FormData();
      fd.append("id", n.id);
      void markNotificationsRead(undefined, fd).then(refresh);
    }
    router.push(n.href);
  };

  const onMarkAll = async () => {
    setSnapshot((s) => ({
      unread_count: 0,
      recent: s.recent.map((r) =>
        r.read_at ? r : { ...r, read_at: new Date().toISOString() },
      ),
    }));
    await markNotificationsRead(undefined, new FormData());
    refresh();
  };

  const unread = snapshot.unread_count;
  const hasItems = snapshot.recent.length > 0;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={
          unread > 0
            ? `Notifications, ${unread} unread`
            : "Notifications"
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative inline-flex h-8 w-8 items-center justify-center rounded-md",
          "text-fg-muted ring-1 ring-transparent transition-colors duration-150",
          "hover:bg-surface-elevated hover:text-fg",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring",
          open && "bg-surface-elevated text-fg",
        )}
        data-testid="notifications-bell"
      >
        <Bell className="h-4 w-4" aria-hidden />
        {unread > 0 ? (
          <span
            data-testid="notifications-badge"
            className={cn(
              "absolute -top-0.5 -right-0.5 inline-flex min-w-[16px] items-center justify-center",
              "rounded-full bg-red-500 px-1 py-px",
              "text-[10px] font-semibold leading-none text-white",
              "ring-2 ring-bg",
            )}
            aria-hidden
          >
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          data-testid="notifications-dropdown"
          className={cn(
            "absolute right-0 top-full z-50 mt-2 w-[360px] max-w-[90vw]",
            "rounded-lg bg-surface ring-1 ring-border shadow-lg shadow-black/5",
            "dark:shadow-none",
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
            <h2 className="text-sm font-semibold text-fg">Notifications</h2>
            {unread > 0 ? (
              <button
                type="button"
                onClick={onMarkAll}
                className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring rounded-sm px-1"
                data-testid="notifications-mark-all"
              >
                <Check className="h-3 w-3" aria-hidden />
                Mark all read
              </button>
            ) : null}
          </div>

          {!hasItems ? (
            <div className="flex flex-col items-center gap-1.5 px-4 py-8 text-center">
              <Inbox className="h-5 w-5 text-fg-subtle" aria-hidden />
              <p className="text-sm text-fg-muted">You&apos;re all caught up.</p>
            </div>
          ) : (
            <ul
              role="list"
              className="max-h-[400px] overflow-y-auto"
              data-testid="notifications-list"
            >
              {snapshot.recent.map((n) => {
                const isUnread = !n.read_at;
                return (
                  <li
                    key={n.id}
                    className={cn(
                      "border-b border-border last:border-b-0",
                      isUnread && "bg-accent-subtle/40",
                    )}
                    data-testid="notifications-item"
                    data-read={isUnread ? "false" : "true"}
                  >
                    <button
                      type="button"
                      onClick={() => onClickItem(n)}
                      className={cn(
                        "block w-full px-4 py-3 text-left",
                        "hover:bg-surface-elevated focus-visible:outline-none focus-visible:bg-surface-elevated",
                      )}
                    >
                      <div className="flex items-start gap-2">
                        {isUnread ? (
                          <span
                            aria-hidden
                            className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                          />
                        ) : (
                          <span aria-hidden className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0" />
                        )}
                        <div className="flex-1 space-y-0.5">
                          <p
                            className={cn(
                              "text-sm leading-snug",
                              isUnread ? "text-fg" : "text-fg-muted",
                            )}
                          >
                            {n.headline}
                          </p>
                          <p className="font-numeric text-xs text-fg-subtle">
                            {relativeTime(n.sent_at)}
                          </p>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
