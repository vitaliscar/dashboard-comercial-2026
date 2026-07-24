import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentSession } from "@/lib/actions/auth";
import { ProtectedShell } from "@/components/protected-shell";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getCurrentSession();
  if (!session) redirect("/auth");

  return <ProtectedShell>{children}</ProtectedShell>;
}
