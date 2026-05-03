import { redirect } from "next/navigation";
import { getSession } from "~/server/better-auth/server";
import { AccountDetail } from "./AccountDetail";

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/signin");
  }

  const { id } = await params;

  return <AccountDetail accountId={id} />;
}
