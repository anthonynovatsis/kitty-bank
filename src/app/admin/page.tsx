import { redirect } from "next/navigation";
import { getSession } from "~/server/better-auth/server";
import { db } from "~/server/db";
import { userSettings } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import { AdminDashboard } from "./components/AdminDashboard";

export default async function AdminPage() {
  const session = await getSession();

  if (!session) {
    redirect("/signin");
  }

  // Check if user is admin
  const settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, session.user.id),
  });

  if (!settings?.isAdmin) {
    redirect("/dashboard");
  }

  return <AdminDashboard />;
}
