import { redirect } from "next/navigation";

import { AppShell } from "~/components/AppShell";
import { getViewer } from "~/server/better-auth/viewer";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/signin");
  // Gate the whole segment, not each page inside it.
  if (!viewer.isAdmin) redirect("/dashboard");

  return <AppShell viewer={viewer}>{children}</AppShell>;
}
