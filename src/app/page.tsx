import Link from "next/link";
import { buttonVariants } from "~/components/ui/button";
import { redirect } from "next/navigation";
import { getSession } from "~/server/better-auth/server";

export default async function Home() {
  const session = await getSession();

  // If already logged in, redirect to dashboard
  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="bg-muted flex min-h-screen flex-col items-center justify-center">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-foreground text-4xl font-bold tracking-tight">
            Welcome to Kitty Bank
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">
            Track your savings and manage your money
          </p>
        </div>

        <div className="mt-8 space-y-4">
          <Link
            href="/signin"
            className={buttonVariants({ size: "lg", className: "w-full" })}
          >
            Sign In
          </Link>

          <Link
            href="/signup"
            className={buttonVariants({
              variant: "outline",
              size: "lg",
              className: "w-full",
            })}
          >
            Create New Account
          </Link>
        </div>
      </div>
    </main>
  );
}
