import { NextRequest, NextResponse } from "next/server";
import { getWalletHistory } from "@/lib/wallet-history";
import { applyRateLimit, denyRateLimit } from "@/app/api/_utils/rate-limit";

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");

  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }

  const rate = applyRateLimit(request, {
    scope: "history",
    identifier: `${address}`,
  });

  if (!rate.ok) {
    return denyRateLimit("rate limit exceeded", rate.responseHeaders);
  }

  try {
    const data = await getWalletHistory(address);

    return NextResponse.json(
      {
        address,
        history: data.history,
        meta: {
          source: data.source,
          isFallback: data.isFallback,
        },
      },
      { headers: rate.responseHeaders },
    );
  } catch (error) {
    console.error("Unable to retrieve wallet history", error);
    const message = error instanceof Error ? error.message : "failed to retrieve wallet history";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: rate.responseHeaders },
    );
  }
}
