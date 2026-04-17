"use client";

import {
  BarChart3,
  Box,
  FileText,
  Home,
  Inbox,
  Package,
  ShoppingCart,
  Truck,
  Users,
  Archive,
} from "lucide-react";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarItem,
  SidebarSection,
} from "@/components/ui/sidebar";
import type { RoleAssignment } from "@/lib/auth/roles";
import { hasAnyRole, isAdmin } from "@/lib/auth/roles";
import { UserMenu } from "./user-menu";

export function AppSidebar({
  roles,
  email,
}: {
  roles: readonly RoleAssignment[];
  email: string;
}) {
  const pathname = usePathname();
  const canApprove = hasAnyRole(roles, ["branch_manager"]);
  const canPack = hasAnyRole(roles, ["packer"]);
  const admin = isAdmin(roles);

  const is = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-fg text-xs font-semibold">
          PP
        </div>
        <span className="text-sm font-medium">Procurement</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarSection label="Workspace">
          <SidebarItem
            as="a"
            href="/dashboard"
            icon={<Home className="h-4 w-4" />}
            label="Dashboard"
            active={is("/dashboard")}
          />
          <SidebarItem
            as="a"
            href="/orders"
            icon={<ShoppingCart className="h-4 w-4" />}
            label="Orders"
            active={is("/orders")}
            shortcut="go"
          />
          <SidebarItem
            as="a"
            href="/invoices"
            icon={<FileText className="h-4 w-4" />}
            label="Invoices"
            active={is("/invoices")}
            shortcut="gi"
          />
          {canApprove ? (
            <SidebarItem
              as="a"
              href="/approvals"
              icon={<Inbox className="h-4 w-4" />}
              label="Approvals"
              active={is("/approvals")}
            />
          ) : null}
        </SidebarSection>
        {canPack ? (
          <SidebarSection label="Warehouse">
            <SidebarItem
              as="a"
              href="/pack"
              icon={<Package className="h-4 w-4" />}
              label="Pack queue"
              active={is("/pack")}
              shortcut="gp"
            />
            <SidebarItem
              as="a"
              href="/shipments"
              icon={<Truck className="h-4 w-4" />}
              label="Shipments"
              active={is("/shipments")}
            />
            <SidebarItem
              as="a"
              href="/returns"
              icon={<Archive className="h-4 w-4" />}
              label="Returns"
              active={is("/returns")}
            />
          </SidebarSection>
        ) : null}
        {admin ? (
          <SidebarSection label="Admin">
            <SidebarItem
              as="a"
              href="/catalog"
              icon={<Box className="h-4 w-4" />}
              label="Catalog"
              active={is("/catalog")}
            />
            <SidebarItem
              as="a"
              href="/users"
              icon={<Users className="h-4 w-4" />}
              label="Users"
              active={is("/users")}
            />
            <SidebarItem
              as="a"
              href="/reports"
              icon={<BarChart3 className="h-4 w-4" />}
              label="Reports"
              active={is("/reports")}
            />
          </SidebarSection>
        ) : null}
      </SidebarContent>
      <SidebarFooter>
        <UserMenu email={email} />
      </SidebarFooter>
    </Sidebar>
  );
}
