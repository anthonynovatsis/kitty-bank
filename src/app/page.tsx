import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "~/server/better-auth/server";

export default async function Home() {
  const session = await getSession();

  // If already logged in, redirect to dashboard
  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900">
            Welcome to Kitty Bank
          </h1>
          <p className="mt-2 text-lg text-gray-600">
            Track your savings and manage your money
          </p>
        </div>

        <div className="mt-8 space-y-4">
          <Link
            href="/signin"
            className="flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-3 text-base font-medium text-white shadow-sm hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none"
          >
            Sign In
          </Link>

          <Link
            href="/signup"
            className="flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-3 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none"
          >
            Create New Account
          </Link>
        </div>
      </div>
    </main>
  );
}
