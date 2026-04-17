import type { UserRole } from "@/lib/auth/roles";

export type SeedUser = {
  email: string;
  password: string;
  full_name: string;
  assignments: Array<{ role: UserRole; branch_code: string | null }>;
};

// Distribution: 1 super_admin, 2 administration, 5 branch_manager (1 per
// branch), 5 packer (HQ-only, no branch), 7 branch_user (rotating).
export const USERS: SeedUser[] = [
  {
    email: "super@example.nl",
    password: "demo-demo-1",
    full_name: "Super Admin",
    assignments: [{ role: "super_admin", branch_code: null }],
  },

  {
    email: "admin1@example.nl",
    password: "demo-demo-1",
    full_name: "Admin One",
    assignments: [{ role: "administration", branch_code: null }],
  },
  {
    email: "admin2@example.nl",
    password: "demo-demo-1",
    full_name: "Admin Two",
    assignments: [{ role: "administration", branch_code: null }],
  },

  {
    email: "ams.mgr@example.nl",
    password: "demo-demo-1",
    full_name: "Amsterdam Manager",
    assignments: [{ role: "branch_manager", branch_code: "AMS" }],
  },
  {
    email: "utr.mgr@example.nl",
    password: "demo-demo-1",
    full_name: "Utrecht Manager",
    assignments: [{ role: "branch_manager", branch_code: "UTR" }],
  },
  {
    email: "rot.mgr@example.nl",
    password: "demo-demo-1",
    full_name: "Rotterdam Manager",
    assignments: [{ role: "branch_manager", branch_code: "ROT" }],
  },
  {
    email: "dha.mgr@example.nl",
    password: "demo-demo-1",
    full_name: "Den Haag Manager",
    assignments: [{ role: "branch_manager", branch_code: "DHA" }],
  },
  {
    email: "haa.mgr@example.nl",
    password: "demo-demo-1",
    full_name: "Haarlem Manager",
    assignments: [{ role: "branch_manager", branch_code: "HAA" }],
  },

  {
    email: "packer1@example.nl",
    password: "demo-demo-1",
    full_name: "Packer 1",
    assignments: [{ role: "packer", branch_code: null }],
  },
  {
    email: "packer2@example.nl",
    password: "demo-demo-1",
    full_name: "Packer 2",
    assignments: [{ role: "packer", branch_code: null }],
  },
  {
    email: "packer3@example.nl",
    password: "demo-demo-1",
    full_name: "Packer 3",
    assignments: [{ role: "packer", branch_code: null }],
  },
  {
    email: "packer4@example.nl",
    password: "demo-demo-1",
    full_name: "Packer 4",
    assignments: [{ role: "packer", branch_code: null }],
  },
  {
    email: "packer5@example.nl",
    password: "demo-demo-1",
    full_name: "Packer 5",
    assignments: [{ role: "packer", branch_code: null }],
  },

  {
    email: "ams.user1@example.nl",
    password: "demo-demo-1",
    full_name: "Amsterdam User 1",
    assignments: [{ role: "branch_user", branch_code: "AMS" }],
  },
  {
    email: "ams.user2@example.nl",
    password: "demo-demo-1",
    full_name: "Amsterdam User 2",
    assignments: [{ role: "branch_user", branch_code: "AMS" }],
  },
  {
    email: "utr.user1@example.nl",
    password: "demo-demo-1",
    full_name: "Utrecht User 1",
    assignments: [{ role: "branch_user", branch_code: "UTR" }],
  },
  {
    email: "rot.user1@example.nl",
    password: "demo-demo-1",
    full_name: "Rotterdam User 1",
    assignments: [{ role: "branch_user", branch_code: "ROT" }],
  },
  {
    email: "rot.user2@example.nl",
    password: "demo-demo-1",
    full_name: "Rotterdam User 2",
    assignments: [{ role: "branch_user", branch_code: "ROT" }],
  },
  {
    email: "dha.user1@example.nl",
    password: "demo-demo-1",
    full_name: "Den Haag User 1",
    assignments: [{ role: "branch_user", branch_code: "DHA" }],
  },
  {
    email: "haa.user1@example.nl",
    password: "demo-demo-1",
    full_name: "Haarlem User 1",
    assignments: [{ role: "branch_user", branch_code: "HAA" }],
  },
];
