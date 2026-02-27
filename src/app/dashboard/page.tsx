import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "~/server/better-auth/server";
import { auth } from "~/server/better-auth";

export default async function Dashboard() {
  const session = await getSession();

  if (!session) {
    redirect("/signin");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 justify-between">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold">Kitty Bank Dashboard</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-700">
                Welcome, {session.user?.name || session.user?.email}
              </span>
              <form>
                <button
                  className="rounded-md bg-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300"
                  formAction={async () => {
                    "use server";
                    await auth.api.signOut({
                      headers: await headers(),
                    });
                    redirect("/");
                  }}
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="py-8">
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-2xl font-bold text-gray-900">
              Your Balance
            </h2>
            <p className="text-4xl font-bold text-green-600">$0.00</p>
            <p className="mt-2 text-sm text-gray-500">
              Banking features coming soon...
            </p>
          </div>

          <div className="mt-8 rounded-lg bg-white p-6 shadow">
            <h3 className="mb-4 text-lg font-medium text-gray-900">
              Recent Transactions
            </h3>
            <p className="text-gray-500">No transactions yet</p>
          </div>
        </div>
      </main>
    </div>
  );
}
