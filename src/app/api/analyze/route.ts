import { NextRequest, NextResponse } from "next/server";
import { analyzeWallet } from "@/lib/analyze-wallet";
import { applyRateLimit, denyRateLimit } from "@/app/api/_utils/rate-limit";

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");

  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }

  const rate = applyRateLimit(request, {
    scope: "analyze",
    identifier: `${address}`,
  });

  if (!rate.ok) {
    return denyRateLimit("rate limit exceeded", rate.responseHeaders);
  }

  try {
    const analysis = await analyzeWallet(address);

    return NextResponse.json(
      {
        address,
        summary: analysis.summary,
        tokens: analysis.tokens,
        insights: analysis.insights,
        meta: analysis.meta,
      },
      { headers: rate.responseHeaders },
    );
  } catch (error) {
    console.error("Unable to analyze wallet", error);
    const message = error instanceof Error ? error.message : "failed to analyze wallet";
    return NextResponse.json({ error: message }, { status: 500, headers: rate.responseHeaders });
  }
}
