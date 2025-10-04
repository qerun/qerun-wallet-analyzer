import { NextRequest, NextResponse } from "next/server";
import { getWalletHistory } from "@/lib/wallet-history";

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");

  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }

  try {
    const data = await getWalletHistory(address);

    return NextResponse.json({
      address,
      history: data.history,
      meta: {
        source: data.source,
        isFallback: data.isFallback,
      },
    });
  } catch (error) {
    console.error("Unable to retrieve wallet history", error);
    const message = error instanceof Error ? error.message : "failed to retrieve wallet history";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
