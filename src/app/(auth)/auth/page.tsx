import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/actions/auth";
import { AuthForm } from "@/components/auth-form";

export default async function AuthPage() {
  const session = await getCurrentSession();
  if (session) redirect("/resumen");

  return <AuthForm />;
}
