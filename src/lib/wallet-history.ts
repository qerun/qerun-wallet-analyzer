import { fetchCovalentTransactions, CovalentConfigurationError } from "@/lib/providers/covalent";

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
  "eth-mainnet": {
    explorer: "https://etherscan.io/tx/",
    symbol: "ETH",
  },
  "matic-mainnet": {
    explorer: "https://polygonscan.com/tx/",
    symbol: "MATIC",
  },
  "bsc-mainnet": {
    explorer: "https://bscscan.com/tx/",
    symbol: "BNB",
  },
  "arbitrum-mainnet": {
    explorer: "https://arbiscan.io/tx/",
    symbol: "ETH",
  },
  "optimism-mainnet": {
    explorer: "https://optimistic.etherscan.io/tx/",
    symbol: "ETH",
  },
};

const SIX_MONTHS = 6;

export async function getWalletHistory(address: string) {
  try {
    const covalentItems = await fetchCovalentTransactions(address, SIX_MONTHS);

    const normalized: WalletTransaction[] = covalentItems.map((item) => {
      const normalizedAddress = address.toLowerCase();
      const direction = item.to_address?.toLowerCase() === normalizedAddress
        ? "in"
        : item.from_address?.toLowerCase() === normalizedAddress
        ? "out"
        : "internal";

      const chainMeta = CHAIN_METADATA[item.chain_name] ?? {
        explorer: "https://etherscan.io/tx/",
        symbol: "N/A",
      };

      return {
        hash: item.tx_hash,
        timestamp: item.block_signed_at,
        direction,
        valueUsd: item.value_quote ?? null,
        symbol: chainMeta.symbol,
        counterparty:
          direction === "in"
            ? item.from_address_label ?? item.from_address
            : item.to_address_label ?? item.to_address ?? undefined,
        chain: item.chain_name,
        gasFeeUsd: item.gas_quote ?? null,
        explorerUrl: `${chainMeta.explorer}${item.tx_hash}`,
      };
    });

    normalized.sort((a, b) => (a.timestamp > b.timestamp ? -1 : 1));

    return {
      history: normalized,
      source: "covalent",
      isFallback: false,
    };
  } catch (error) {
    if (error instanceof CovalentConfigurationError) {
      return {
        history: fallbackHistory(),
        source: "demo",
        isFallback: true,
      };
    }

    console.error("Failed to fetch wallet history", error);
    return {
      history: fallbackHistory(),
      source: "error",
      isFallback: true,
    };
  }
}

function fallbackHistory(): WalletTransaction[] {
  const now = new Date();
  const items = [
    {
      hash: "0x-demo-reward",
      timestamp: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 15).toISOString(),
      direction: "in" as const,
      valueUsd: 1820,
      symbol: "ETH",
      counterparty: "Reward Vault",
      chain: "eth-mainnet",
      gasFeeUsd: 4.32,
      explorerUrl: "https://etherscan.io/tx/0x-demo-reward",
    },
    {
      hash: "0x-demo-stable-swap",
      timestamp: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 32).toISOString(),
      direction: "out" as const,
      valueUsd: 9500,
      symbol: "USDC",
      counterparty: "Curve.fi",
      chain: "eth-mainnet",
      gasFeeUsd: 3.1,
      explorerUrl: "https://etherscan.io/tx/0x-demo-stable-swap",
    },
    {
      hash: "0x-demo-bridge",
      timestamp: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 60).toISOString(),
      direction: "out" as const,
      valueUsd: 12000,
      symbol: "ETH",
      counterparty: "Arbitrum Bridge",
      chain: "arbitrum-mainnet",
      gasFeeUsd: 1.6,
      explorerUrl: "https://arbiscan.io/tx/0x-demo-bridge",
    },
    {
      hash: "0x-demo-quest",
      timestamp: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 95).toISOString(),
      direction: "in" as const,
      valueUsd: 4500,
      symbol: "OP",
      counterparty: "Optimism Quest",
      chain: "optimism-mainnet",
      gasFeeUsd: 0.9,
      explorerUrl: "https://optimistic.etherscan.io/tx/0x-demo-quest",
    },
  ];

  return items
    .concat(
      {
        hash: "0x-demo-airdrop",
        timestamp: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 128).toISOString(),
        direction: "in" as const,
        valueUsd: 3200,
        symbol: "ARB",
        counterparty: "Airdrop",
        chain: "arbitrum-mainnet",
        gasFeeUsd: 0.75,
        explorerUrl: "https://arbiscan.io/tx/0x-demo-airdrop",
      }
    )
    .sort((a, b) => (a.timestamp > b.timestamp ? -1 : 1));
}
