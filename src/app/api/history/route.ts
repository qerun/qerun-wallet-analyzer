import { NextRequest, NextResponse } from "next/server";
import { getWalletHistory, type WalletTransaction } from "@/lib/wallet-history";
import { resolveAddress, AddressResolutionError } from "@/lib/resolve-address";
import { applyRateLimit, denyRateLimit } from "@/app/api/_utils/rate-limit";

const ONE_HOUR_MS = 60 * 60 * 1000;

type HistoryCacheEntry = {
  expiresAt: number;
  payload: {
    address: string;
    history: WalletTransaction[];
    meta: {
      source: string;
      isFallback: boolean;
    };
  };
};

const historyCache = new Map<string, HistoryCacheEntry>();

export async function GET(request: NextRequest) {
  const requestedAddress = request.nextUrl.searchParams.get("address");

  if (!requestedAddress) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }

  let address: string;
  try {
    address = await resolveAddress(requestedAddress);
  } catch (error) {
    if (error instanceof AddressResolutionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const rate = applyRateLimit(request, {
    scope: "history",
    identifier: `${address}`,
  });

  if (!rate.ok) {
    return denyRateLimit("rate limit exceeded", rate.responseHeaders);
  }

  const cached = historyCache.get(address);
  if (cached && cached.expiresAt > Date.now()) {
    rate.responseHeaders.set("X-Cache", "HIT");
    return NextResponse.json(cached.payload, { headers: rate.responseHeaders });
  } else if (cached) {
    historyCache.delete(address);
  }

  try {
    const data = await getWalletHistory(address);

    const responseBody: HistoryCacheEntry["payload"] = {
      address,
      history: data.history,
      meta: {
        source: data.source,
        isFallback: data.isFallback,
      },
    };

    historyCache.set(address, {
      payload: responseBody,
      expiresAt: Date.now() + ONE_HOUR_MS,
    });

    rate.responseHeaders.set("X-Cache", "MISS");

    return NextResponse.json(responseBody, { headers: rate.responseHeaders });
  } catch (error) {
    console.error("Unable to retrieve wallet history", error);
    const message = error instanceof Error ? error.message : "failed to retrieve wallet history";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: rate.responseHeaders },
    );
  }
}
