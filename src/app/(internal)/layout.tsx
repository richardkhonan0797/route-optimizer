import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { Shell } from "@/components/shell";
export const dynamic = "force-dynamic";
export default async function InternalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireAdmin();
  } catch {
    redirect("/login");
  }
  return <Shell>{children}</Shell>;
}
