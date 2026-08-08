import { redirect } from "next/navigation";

import { AppShell } from "~/components/AppShell";
import { getViewer } from "~/server/better-auth/viewer";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/signin");

  return <AppShell viewer={viewer}>{children}</AppShell>;
}
