"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "~/server/better-auth";

/** Shared by the app shell, which every signed-in page renders. */
export async function signOut() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/");
}
