import { redirect } from "next/navigation";
import { getSession } from "~/server/better-auth/server";
import { HoldingDetail } from "./HoldingDetail";

export default async function HoldingDetailPage({
  params,
}: {
  params: Promise<{ id: string; symbol: string }>;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/signin");
  }

  const { id, symbol } = await params;

  // Symbols travel in the path, so they arrive percent-encoded.
  return <HoldingDetail accountId={id} symbol={decodeURIComponent(symbol)} />;
}
