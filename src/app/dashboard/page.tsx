import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "~/server/better-auth/server";
import { auth } from "~/server/better-auth";
import { Button } from "~/components/ui/button";
import { ThemeSwitcher } from "~/components/ThemeSwitcher";
import { DashboardContent } from "./components/DashboardContent";

export default async function Dashboard() {
  const session = await getSession();

  if (!session) {
    redirect("/signin");
  }

  return (
    <div className="bg-muted min-h-screen">
      <nav className="bg-card shadow">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 justify-between">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold">Kitty Bank Dashboard</h1>
            </div>
            <div className="flex items-center space-x-4">
              <ThemeSwitcher />
              <span className="text-foreground text-sm">
                Welcome, {session.user?.name || session.user?.email}
              </span>
              <form>
                <Button
                  variant="secondary"
                  size="sm"
                  // Base UI's Button defaults to type="button", which silently
                  // disables formAction. The server action needs a submit.
                  type="submit"
                  formAction={async () => {
                    "use server";
                    await auth.api.signOut({
                      headers: await headers(),
                    });
                    redirect("/");
                  }}
                >
                  Sign out
                </Button>
              </form>
            </div>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="py-8">
          <DashboardContent />
        </div>
      </main>
    </div>
  );
}
