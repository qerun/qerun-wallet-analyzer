const DEFAULT_BASE_URL = "https://api.covalenthq.com/v1";
const DEFAULT_CHAINS = (process.env.COVALENT_CHAIN_IDS ?? "eth-mainnet")
  .split(",")
  .map((chain) => chain.trim())
  .filter(Boolean);

export class CovalentConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CovalentConfigurationError";
  }
}

const USD = "USD";

function requireApiKey() {
  const apiKey = process.env.COVALENT_API_KEY;
  if (!apiKey) {
    throw new CovalentConfigurationError("COVALENT_API_KEY is not configured");
  }
  return apiKey;
}

function resolveChains() {
  return DEFAULT_CHAINS.length > 0 ? DEFAULT_CHAINS : ["eth-mainnet"];
}

function resolveBaseUrl() {
  return process.env.COVALENT_API_BASE ?? DEFAULT_BASE_URL;
}

function buildCovalentUrl(path: string, params: Record<string, string | undefined>) {
  const url = new URL(`${resolveBaseUrl()}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== "") {
      url.searchParams.set(key, value);
    }
  });
  return url;
}

export type CovalentTransaction = {
  tx_hash: string;
  block_signed_at: string;
  successful: boolean;
  from_address_label?: string | null;
  from_address: string;
  to_address_label?: string | null;
  to_address: string | null;
  value?: string | null;
  value_quote?: number | null;
  fees_paid?: string | null;
  gas_quote?: number | null;
  chain_name: string;
};

export type CovalentBalanceItem = {
  contract_name: string | null;
  contract_ticker_symbol: string | null;
  contract_address: string;
  contract_decimals: number;
  balance: string;
  balance_24h?: string | null;
  quote?: number | null;
  quote_rate?: number | null;
  quote_24h?: number | null;
  logo_url?: string | null;
  type?: string | null;
};

export type CovalentPortfolioPoint = {
  timestamp: string;
  value: number;
  chain: string;
};

export async function fetchCovalentBalances(address: string) {
  const apiKey = requireApiKey();
  const chains = resolveChains();

  const requests = chains.map(async (chain) => {
    const url = buildCovalentUrl(`/${chain}/address/${address}/balances_v2/`, {
      "quote-currency": USD,
      format: "JSON",
      nft: "false",
      "no-nft-fetch": "true",
      key: apiKey,
    });

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Covalent balances error (${response.status}): ${body}`);
    }

    const json = (await response.json()) as {
      data?: { items?: CovalentBalanceItem[] };
      error?: boolean;
      error_message?: string;
    };

    if (json.error) {
      throw new Error(json.error_message ?? "Unknown Covalent balances error");
    }

    return {
      chain,
      items: json.data?.items ?? [],
    };
  });

  return Promise.all(requests);
}

export async function fetchCovalentPortfolio(address: string, days = 30) {
  const apiKey = requireApiKey();
  const chains = resolveChains();

  const requests = chains.map(async (chain) => {
    const url = buildCovalentUrl(`/${chain}/address/${address}/portfolio_v2/`, {
      "quote-currency": USD,
      days: String(days),
      "time-bucket": "day",
      "page-size": String(days * 2),
      key: apiKey,
    });

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Covalent portfolio error (${response.status}): ${body}`);
    }

    const json = (await response.json()) as {
      data?: {
        items?: Array<{
          holdings?: Array<{
            timestamp: string;
            close?: { quote?: number | null };
          }>;
        }>;
      };
      error?: boolean;
      error_message?: string;
    };

    if (json.error) {
      throw new Error(json.error_message ?? "Unknown Covalent portfolio error");
    }

    const holdings = json.data?.items ?? [];

    const points: CovalentPortfolioPoint[] = [];

    holdings.forEach((item) => {
      item.holdings?.forEach((holding) => {
        const value = holding.close?.quote ?? 0;
        if (value == null) {
          return;
        }
        points.push({
          timestamp: holding.timestamp,
          value,
          chain,
        });
      });
    });

    return points;
  });

  const results = await Promise.all(requests);
  return results.flat();
}

export async function fetchCovalentTransactions(address: string, months = 6) {
  const apiKey = requireApiKey();
  const chains = resolveChains();
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const sinceIso = since.toISOString();

  const requests = chains.map(async (chain) => {
    const url = buildCovalentUrl(`/${chain}/address/${address}/transactions_v3/`, {
      "page-size": "200",
      "no-logs": "true",
      "block-signed-at-gt": sinceIso,
      key: apiKey,
    });

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Covalent API error (${response.status}): ${body}`);
    }

    const json = (await response.json()) as {
      data?: { items?: CovalentTransaction[] };
      error?: boolean;
      error_message?: string;
    };

    if (json.error) {
      throw new Error(json.error_message ?? "Unknown Covalent API error");
    }

    return {
      chain,
      items: json.data?.items ?? [],
    };
  });

  const results = await Promise.all(requests);
  return results.flatMap((result) =>
    result.items.map((item) => ({
      ...item,
      chain_name: result.chain,
    }))
  );
}
