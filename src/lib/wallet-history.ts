import { fetchMoralisTransactions, MoralisConfigurationError } from "@/lib/providers/moralis";

export type WalletTransaction = {
  hash: string;
  timestamp: string;
  direction: "in" | "out" | "internal";
  valueUsd: number | null;
  amount?: number | null;
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

const SIX_MONTHS = 6;

export async function getWalletHistory(address: string) {
  try {
    const moralisItems = await fetchMoralisTransactions(address, SIX_MONTHS);

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

      return {
        hash: item.hash,
        timestamp: item.block_timestamp,
        direction,
        valueUsd: null,
        symbol: chainMeta.symbol,
        counterparty:
          direction === "in"
            ? item.from_address_label ?? item.from_address
            : item.to_address_label ?? item.to_address ?? undefined,
        chain,
        gasFeeUsd: null,
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
