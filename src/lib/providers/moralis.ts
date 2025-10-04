const DEFAULT_BASE_URL = process.env.MORALIS_API_BASE ?? "https://deep-index.moralis.io/api/v2.2";
const DEFAULT_CHAINS = (process.env.MORALIS_CHAINS ?? "eth,arbitrum,optimism")
  .split(",")
  .map((chain) => chain.trim())
  .filter(Boolean);

export class MoralisConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoralisConfigurationError";
  }
}

function requireApiKey() {
  const apiKey = process.env.MORALIS_API_KEY;
  if (!apiKey) {
    throw new MoralisConfigurationError("MORALIS_API_KEY is not configured");
  }
  return apiKey;
}

function resolveChains() {
  return DEFAULT_CHAINS.length > 0 ? DEFAULT_CHAINS : ["eth"];
}

function buildMoralisUrl(path: string, params: Record<string, string | undefined>) {
  const url = new URL(`${DEFAULT_BASE_URL}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== "") {
      url.searchParams.set(key, value);
    }
  });
  return url;
}

async function moralisFetch<T>(path: string, params: Record<string, string | undefined>) {
  const apiKey = requireApiKey();
  const url = buildMoralisUrl(path, params);

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-API-Key": apiKey,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Moralis API error (${response.status}): ${body}`);
  }

  return (await response.json()) as T;
}

export type MoralisTokenHolding = {
  chain: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  usdPrice: number | null;
  usdValue: number | null;
  usdValue24h?: number | null;
  possibleSpam?: boolean;
  logo?: string | null;
  isNative: boolean;
};

export type MoralisTransaction = {
  hash: string;
  nonce: string;
  from_address: string;
  to_address: string | null;
  from_address_label?: string | null;
  to_address_label?: string | null;
  value: string;
  gas_price?: string | null;
  receipt_gas_used?: string | null;
  block_timestamp: string;
  chain?: string;
};

export async function fetchMoralisBalances(address: string) {
  const chains = resolveChains();

  const settlements = await Promise.allSettled(
    chains.map((chain) => fetchBalancesForChain(address, chain))
  );

  const holdings: MoralisTokenHolding[] = [];
  const errors: Error[] = [];

  settlements.forEach((settlement) => {
    if (settlement.status === "fulfilled") {
      holdings.push(...settlement.value);
    } else if (settlement.reason instanceof Error) {
      errors.push(settlement.reason);
    } else {
      errors.push(new Error("Unknown Moralis balance error"));
    }
  });

  if (holdings.length === 0) {
    const message = errors[0]?.message ?? "No balances returned from Moralis";
    throw new Error(message);
  }

  return holdings;
}

async function fetchBalancesForChain(address: string, chain: string) {
  const data = await moralisFetch<{
    result?: Array<{
      token_address?: string;
      symbol?: string;
      name?: string;
      logo?: string | null;
      decimals?: number;
      balance: string;
      usd_price?: number | string | null;
      usd_value?: number | string | null;
      usd_value_24hr_usd_change?: number | string | null;
      usd_value_24hr_percent_change?: number | string | null;
      usd_price_24hr_usd_change?: number | string | null;
      usd_price_24hr_percent_change?: number | string | null;
      native_token?: boolean;
    }>;
  }>(`/wallets/${address}/tokens`, {
    chain,
    include: "erc20Metadata,usd",
  });

  const items = Array.isArray(data?.result) ? data.result : [];

  console.log("[Moralis] Wallet tokens response", {
    chain,
    count: items.length,
  });

  const nativeItem = items.find((item) => item.native_token);

  const nativeHolding: MoralisTokenHolding = {
    chain,
    symbol: nativeItem?.symbol ?? chain.toUpperCase(),
    name: nativeItem?.name ?? `${chain.toUpperCase()} Native`,
    decimals: nativeItem?.decimals ?? 18,
    balance: nativeItem?.balance ?? "0",
    usdPrice: toNumber(nativeItem?.usd_price),
    usdValue: toNumber(nativeItem?.usd_value),
    usdValue24h: toNumber(nativeItem?.usd_value_24hr_usd_change),
    possibleSpam: nativeItem?.possible_spam ?? false,
    logo: nativeItem?.logo ?? null,
    isNative: true,
  };

  const tokenHoldings: MoralisTokenHolding[] = items
    .filter((item) => !item.native_token)
    .map((token) => ({
      chain,
      symbol: token.symbol ?? "UNKNOWN",
      name: token.name ?? token.symbol ?? "Unknown Token",
      decimals: token.decimals ?? 18,
      balance: token.balance ?? "0",
      usdPrice: toNumber(token.usd_price),
      usdValue: toNumber(token.usd_value),
      usdValue24h: toNumber(token.usd_value_24hr_usd_change),
      possibleSpam: token.possible_spam ?? false,
      logo: token.logo ?? null,
      isNative: false,
    }));

  return [nativeHolding, ...tokenHoldings];
}

export async function fetchMoralisTransactions(address: string, months = 6) {
  const chains = resolveChains();
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const sinceIso = since.toISOString();

  const settlements = await Promise.allSettled(
    chains.map((chain) => fetchTransactionsForChain(address, chain, sinceIso))
  );

  const transactions: MoralisTransaction[] = [];
  const errors: Error[] = [];

  settlements.forEach((settlement) => {
    if (settlement.status === "fulfilled") {
      transactions.push(...settlement.value);
    } else if (settlement.reason instanceof Error) {
      errors.push(settlement.reason);
    } else {
      errors.push(new Error("Unknown Moralis transaction error"));
    }
  });

  if (transactions.length === 0) {
    const message = errors[0]?.message ?? "No transactions returned from Moralis";
    throw new Error(message);
  }

  return transactions;
}

async function fetchTransactionsForChain(address: string, chain: string, sinceIso: string) {
  const items: MoralisTransaction[] = [];
  let cursor: string | undefined;

  do {
    const data = await moralisFetch<{
      result: MoralisTransaction[];
      cursor?: string | null;
    }>(`/${address}`, {
      chain,
      limit: "100",
      order: "desc",
      from_date: sinceIso,
      cursor,
      include: "labels",
    });

    const txs = Array.isArray(data.result) ? data.result : [];

    console.log("[Moralis] Transactions response", {
      chain,
      batchCount: txs.length,
      cursor: data.cursor ?? null,
    });

    txs.forEach((tx) => {
      items.push({ ...tx, chain });
    });

    cursor = data.cursor ?? undefined;

    if (items.length >= 200) {
      cursor = undefined;
    }
  } while (cursor);

  return items;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
