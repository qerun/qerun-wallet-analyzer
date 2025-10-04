import {
  fetchMoralisTransactions,
  MoralisConfigurationError,
  type MoralisTransaction,
} from "@/lib/providers/moralis";

export type WalletTransaction = {
  hash: string;
  timestamp: string;
  direction: "in" | "out" | "internal";
  valueUsd: number | null;
  amount: number | null;
  symbol?: string | null;
  counterparty?: string | null;
  chain: string;
  gasFeeUsd: number | null;
  explorerUrl?: string;
};

const CHAIN_METADATA: Record<string, { explorer: string; symbol: string }> = {
  eth: {
    explorer: "https://etherscan.io/tx/",
    symbol: "ETH",
  },
  polygon: {
    explorer: "https://polygonscan.com/tx/",
    symbol: "MATIC",
  },
  bsc: {
    explorer: "https://bscscan.com/tx/",
    symbol: "BNB",
  },
  arbitrum: {
    explorer: "https://arbiscan.io/tx/",
    symbol: "ETH",
  },
  optimism: {
    explorer: "https://optimistic.etherscan.io/tx/",
    symbol: "ETH",
  },
}; 

const CHAIN_DECIMALS: Record<string, number> = {
  eth: 18,
  polygon: 18,
  bsc: 18,
  arbitrum: 18,
  optimism: 18,
};

const HISTORY_LOOKBACK_DAYS = 14;

export async function getWalletHistory(address: string) {
  try {
    const moralisItems = await fetchMoralisTransactions(address, HISTORY_LOOKBACK_DAYS);

    const normalized: WalletTransaction[] = moralisItems.map((item) => {
      const normalizedAddress = address.toLowerCase();
      const direction = item.to_address?.toLowerCase() === normalizedAddress
        ? "in"
        : item.from_address?.toLowerCase() === normalizedAddress
        ? "out"
        : "internal";

      const chain = item.chain ?? "eth";
      const chainMeta = CHAIN_METADATA[chain] ?? {
        explorer: "https://etherscan.io/tx/",
        symbol: "N/A",
      };

      const valueUsd = toNumber(item.usd_value);
      const gasFeeUsd = toNumber(item.fee?.usd_value);
      const amount = resolveAmount(item, chain);

      return {
        hash: item.hash,
        timestamp: item.block_timestamp,
        direction,
        valueUsd,
        amount,
        symbol: chainMeta.symbol,
        counterparty:
          direction === "in"
            ? item.from_address_label ?? item.from_address
            : item.to_address_label ?? item.to_address ?? undefined,
        chain,
        gasFeeUsd,
        explorerUrl: `${chainMeta.explorer}${item.hash}`,
      };
    });

    normalized.sort((a, b) => (a.timestamp > b.timestamp ? -1 : 1));

    return {
      history: normalized,
      source: "moralis",
      isFallback: false,
    };
  } catch (error) {
    console.error("Failed to fetch wallet history", error);
    if (error instanceof MoralisConfigurationError) {
      throw new Error("Moralis API key is missing or invalid");
    }

    throw error instanceof Error ? error : new Error("Failed to fetch wallet history");
  }
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

function resolveAmount(
  item: MoralisTransaction,
  chain: string,
): number | null {
  if (item.value_decimal) {
    const parsed = Number.parseFloat(item.value_decimal);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  const wei = item.value;
  if (!wei) {
    return null;
  }

  const decimals = CHAIN_DECIMALS[chain] ?? 18;
  const divisor = Math.pow(10, decimals);
  const asNumber = Number(wei);
  if (!Number.isFinite(asNumber)) {
    return null;
  }

  return asNumber / divisor;
}
