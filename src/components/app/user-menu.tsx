"use client";

import { LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui/button";

export function UserMenu({ email }: { email: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-subtle text-[10px] font-semibold text-accent-subtle-fg">
          {email.slice(0, 2).toUpperCase()}
        </div>
        <span className="truncate text-xs text-fg-muted">{email}</span>
      </div>
      <div className="flex items-center justify-between px-1">
        <ThemeToggle />
        <form action="/logout" method="post">
          <Button type="submit" variant="ghost" size="icon" aria-label="Sign out">
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </form>
      </div>
    </div>
  );
}
