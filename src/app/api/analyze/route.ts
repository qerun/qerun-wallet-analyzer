import { NextRequest, NextResponse } from "next/server";
import { analyzeWallet, type WalletAnalysis } from "@/lib/analyze-wallet";
import { applyRateLimit, denyRateLimit } from "@/app/api/_utils/rate-limit";

const ONE_HOUR_MS = 60 * 60 * 1000;

type AnalyzeCacheEntry = {
  expiresAt: number;
  payload: {
    address: string;
    summary: WalletAnalysis["summary"];
    tokens: WalletAnalysis["tokens"];
    insights: WalletAnalysis["insights"];
    meta: WalletAnalysis["meta"];
  };
};

const analyzeCache = new Map<string, AnalyzeCacheEntry>();

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

  const cached = analyzeCache.get(address);
  if (cached && cached.expiresAt > Date.now()) {
    rate.responseHeaders.set("X-Cache", "HIT");
    return NextResponse.json(cached.payload, { headers: rate.responseHeaders });
  } else if (cached) {
    analyzeCache.delete(address);
  }

  try {
    const analysis = await analyzeWallet(address);

    const responseBody: AnalyzeCacheEntry["payload"] = {
      address,
      summary: analysis.summary,
      tokens: analysis.tokens,
      insights: analysis.insights,
      meta: analysis.meta,
    };

    analyzeCache.set(address, {
      payload: responseBody,
      expiresAt: Date.now() + ONE_HOUR_MS,
    });

    rate.responseHeaders.set("X-Cache", "MISS");

    return NextResponse.json(responseBody, { headers: rate.responseHeaders });
  } catch (error) {
    console.error("Unable to analyze wallet", error);
    const message = error instanceof Error ? error.message : "failed to analyze wallet";
    return NextResponse.json({ error: message }, { status: 500, headers: rate.responseHeaders });
  }
}
