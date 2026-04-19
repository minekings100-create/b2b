"use client";

import { useFormState, useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  CATEGORY_LABELS,
  FORCED_DISCLOSURE_TEXT,
  FORCED_EMAIL_TRIGGERS,
  TRIGGER_CATEGORY,
  type NotificationCategory,
  type NotificationChannel,
} from "@/lib/email/categories";

import {
  savePreferences,
  type PreferencesState,
} from "../actions";

/**
 * 3.3.3a step 7 — notification-preferences form.
 *
 * Server Component parent renders this with the user's current prefs.
 * Form submits via `useFormState` so we get an in-place success /
 * error message after the save action returns. `revalidatePath` on the
 * server side re-renders the Server Component, which re-seeds `initial`
 * with the freshly-persisted values — no stale form state.
 */
type PrefShape = Record<
  NotificationCategory,
  { email: boolean; in_app: boolean }
>;

const CATEGORIES: readonly NotificationCategory[] = [
  "state_changes",
  "admin_alerts",
];
const CHANNELS: readonly NotificationChannel[] = ["email", "in_app"];

const CHANNEL_HEADER: Record<NotificationChannel, string> = {
  email: "Email",
  in_app: "In-app",
};

function isEmailForced(cat: NotificationCategory): boolean {
  return FORCED_EMAIL_TRIGGERS.some(
    (trigger) => TRIGGER_CATEGORY[trigger] === cat,
  );
}

export function NotificationsForm({ initial }: { initial: PrefShape }) {
  const [state, action] = useFormState<PreferencesState, FormData>(
    savePreferences,
    undefined,
  );
  const anyLocked = CATEGORIES.some((cat) => isEmailForced(cat));

  return (
    <form action={action} className="mt-6 rounded-lg bg-surface p-4 ring-1 ring-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-fg-subtle">
            <th className="py-2 pr-4 text-left">Category</th>
            {CHANNELS.map((chan) => (
              <th key={chan} className="py-2 px-4 text-center">
                {CHANNEL_HEADER[chan]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CATEGORIES.map((cat) => {
            const { label, description } = CATEGORY_LABELS[cat];
            const emailForced = isEmailForced(cat);
            return (
              <tr
                key={cat}
                className="border-b border-border last:border-b-0 align-top"
              >
                <td className="py-3 pr-4">
                  <p className="font-medium text-fg">{label}</p>
                  <p className="mt-0.5 text-xs text-fg-muted">{description}</p>
                </td>
                {CHANNELS.map((chan) => {
                  const locked = chan === "email" && emailForced;
                  // Locked rows visually read as checked (the channel is
                  // forced on) regardless of the stored bit. The server
                  // preserves the stored bit on save — `disabled` here
                  // is a UX concern only.
                  const checked = locked ? true : initial[cat][chan];
                  const inputId = `pref-${cat}-${chan}`;
                  return (
                    <td key={chan} className="py-3 px-4 text-center">
                      <label
                        htmlFor={inputId}
                        className="inline-flex cursor-pointer items-center justify-center"
                        title={
                          locked
                            ? "This channel is required for compliance and cannot be turned off."
                            : undefined
                        }
                      >
                        <input
                          id={inputId}
                          type="checkbox"
                          name={`${cat}.${chan}`}
                          defaultChecked={checked}
                          disabled={locked}
                          className="h-4 w-4 rounded border-border accent-accent disabled:cursor-not-allowed disabled:opacity-50"
                          aria-describedby={
                            locked ? `${inputId}-locked` : undefined
                          }
                        />
                        {locked ? (
                          <span id={`${inputId}-locked`} className="sr-only">
                            Required — cannot be turned off
                          </span>
                        ) : null}
                      </label>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      {anyLocked ? (
        <p className="mt-3 text-xs text-fg-subtle">{FORCED_DISCLOSURE_TEXT}</p>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-3">
        <FormMessage state={state} />
        <SaveButton />
      </div>
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" loading={pending}>
      {pending ? "Saving" : "Save preferences"}
    </Button>
  );
}

function FormMessage({ state }: { state: PreferencesState }) {
  if (!state) return <span />;
  if ("success" in state) {
    return (
      <span
        className="text-xs text-success-subtle-fg"
        role="status"
        aria-live="polite"
      >
        Preferences saved
      </span>
    );
  }
  return (
    <span
      className="text-xs text-danger"
      role="alert"
      aria-live="assertive"
    >
      Couldn&apos;t save preferences, try again
    </span>
  );
}
