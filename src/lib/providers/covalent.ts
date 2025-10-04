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

export async function fetchCovalentTransactions(address: string, months = 6) {
  const apiKey = process.env.COVALENT_API_KEY;
  if (!apiKey) {
    throw new CovalentConfigurationError("COVALENT_API_KEY is not configured");
  }

  const baseUrl = process.env.COVALENT_API_BASE ?? DEFAULT_BASE_URL;
  const chains = DEFAULT_CHAINS.length > 0 ? DEFAULT_CHAINS : ["eth-mainnet"];
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const sinceIso = since.toISOString();

  const requests = chains.map(async (chain) => {
    const url = new URL(`${baseUrl}/${chain}/address/${address}/transactions_v3/`);
    url.searchParams.set("page-size", "200");
    url.searchParams.set("no-logs", "true");
    url.searchParams.set("block-signed-at-gt", sinceIso);
    url.searchParams.set("key", apiKey);

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
