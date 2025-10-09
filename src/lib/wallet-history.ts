import {
  CoinbaseConfigurationError,
  fetchCoinbaseTransactions,
  type CoinbaseTransactionResource,
} from "@/lib/providers/coinbase";

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

const DEFAULT_EXPLORER = "https://etherscan.io/tx/";

const CHAIN_METADATA: Record<string, { explorer: string; symbol: string }> = {
  eth: { explorer: "https://etherscan.io/tx/", symbol: "ETH" },
  base: { explorer: "https://basescan.org/tx/", symbol: "ETH" },
  "base-sepolia": { explorer: "https://sepolia.basescan.org/tx/", symbol: "ETH" },
  polygon: { explorer: "https://polygonscan.com/tx/", symbol: "MATIC" },
  arbitrum: { explorer: "https://arbiscan.io/tx/", symbol: "ETH" },
  "arbitrum-mainnet": { explorer: "https://arbiscan.io/tx/", symbol: "ETH" },
  optimism: { explorer: "https://optimistic.etherscan.io/tx/", symbol: "ETH" },
  bsc: { explorer: "https://bscscan.com/tx/", symbol: "BNB" },
  avalanche: { explorer: "https://snowtrace.io/tx/", symbol: "AVAX" },
  fantom: { explorer: "https://ftmscan.com/tx/", symbol: "FTM" },
  zksync: { explorer: "https://explorer.zksync.io/tx/", symbol: "ETH" },
  linea: { explorer: "https://lineascan.build/tx/", symbol: "ETH" },
  scroll: { explorer: "https://scrollscan.com/tx/", symbol: "ETH" },
  metis: { explorer: "https://explorer.metis.io/tx/", symbol: "METIS" },
  klaytn: { explorer: "https://scope.klaytn.com/tx/", symbol: "KLAY" },
  celo: { explorer: "https://celoscan.io/tx/", symbol: "CELO" },
  moonbeam: { explorer: "https://moonscan.io/tx/", symbol: "GLMR" },
  moonriver: { explorer: "https://moonriver.moonscan.io/tx/", symbol: "MOVR" },
  aurora: { explorer: "https://explorer.aurora.dev/tx/", symbol: "AURORA" },
  cronos: { explorer: "https://cronoscan.com/tx/", symbol: "CRO" },
  gnosis: { explorer: "https://gnosisscan.io/tx/", symbol: "XDAI" },
  harmony: { explorer: "https://explorer.harmony.one/tx/", symbol: "ONE" },
};

const CHAIN_DECIMALS: Record<string, number> = {
  eth: 18,
  base: 18,
  "base-sepolia": 18,
  polygon: 18,
  arbitrum: 18,
  "arbitrum-mainnet": 18,
  optimism: 18,
  bsc: 18,
  avalanche: 18,
  fantom: 18,
  zksync: 18,
  linea: 18,
  scroll: 18,
  metis: 18,
  klaytn: 18,
  celo: 18,
  moonbeam: 18,
  moonriver: 18,
  aurora: 18,
  cronos: 18,
  gnosis: 18,
  harmony: 18,
};

const CHAIN_ALIAS_MAP: Record<string, string> = {
  eth: "eth",
  ethereum: "eth",
  "1": "eth",
  "eip155:1": "eth",
  "ethereum-mainnet": "eth",
  base: "base",
  "base-sepolia": "base-sepolia",
  "8453": "base",
  "eip155:8453": "base",
  "base-mainnet": "base",
  polygon: "polygon",
  "137": "polygon",
  "eip155:137": "polygon",
  "polygon-mainnet": "polygon",
  arbitrum: "arbitrum",
  "42161": "arbitrum",
  "eip155:42161": "arbitrum",
  "arbitrum-one": "arbitrum",
  "arbitrum-mainnet": "arbitrum",
  optimism: "optimism",
  "10": "optimism",
  "eip155:10": "optimism",
  "optimism-mainnet": "optimism",
  bsc: "bsc",
  "56": "bsc",
  "eip155:56": "bsc",
  "bnb-mainnet": "bsc",
  avalanche: "avalanche",
  "43114": "avalanche",
  "eip155:43114": "avalanche",
  "avalanche-mainnet": "avalanche",
  fantom: "fantom",
  "250": "fantom",
  "eip155:250": "fantom",
  "fantom-mainnet": "fantom",
  zksync: "zksync",
  "324": "zksync",
  "eip155:324": "zksync",
  "zksync-era": "zksync",
  linea: "linea",
  "1101": "linea",
  "eip155:1101": "linea",
  "linea-mainnet": "linea",
  scroll: "scroll",
  "534352": "scroll",
  "eip155:534352": "scroll",
  "scroll-mainnet": "scroll",
  metis: "metis",
  "1088": "metis",
  "eip155:1088": "metis",
  "metis-andromeda": "metis",
  klaytn: "klaytn",
  "8217": "klaytn",
  "eip155:8217": "klaytn",
  celo: "celo",
  "42220": "celo",
  "eip155:42220": "celo",
  "celo-mainnet": "celo",
  moonbeam: "moonbeam",
  "1284": "moonbeam",
  "eip155:1284": "moonbeam",
  moonriver: "moonriver",
  "1285": "moonriver",
  "eip155:1285": "moonriver",
  aurora: "aurora",
  "1313161554": "aurora",
  "eip155:1313161554": "aurora",
  cronos: "cronos",
  "25": "cronos",
  "eip155:25": "cronos",
  gnosis: "gnosis",
  xdai: "gnosis",
  "100": "gnosis",
  "eip155:100": "gnosis",
  harmony: "harmony",
  "1666600000": "harmony",
  "eip155:1666600000": "harmony",
};

export async function getWalletHistory(address: string) {
  const normalizedAddress = address.toLowerCase();

  try {
    const coinbaseItems = await fetchCoinbaseTransactions(address);

    const history = coinbaseItems
      .map((item) => normalizeTransaction(item, normalizedAddress))
      .filter((tx): tx is WalletTransaction => tx !== null)
      .sort((a, b) => (a.timestamp > b.timestamp ? -1 : 1))
      .slice(0, 100);

    return {
      history,
      source: "coinbase",
      isFallback: history.length === 0,
    };
  } catch (error) {
    console.error("Failed to fetch wallet history", error);
    if (error instanceof CoinbaseConfigurationError) {
      throw new Error("Coinbase API credentials are missing or invalid");
    }

    throw error instanceof Error ? error : new Error("Failed to fetch wallet history");
  }
}

type CoinbaseTransactionContent = {
  block_timestamp?: string;
  hash?: string;
  from?: string;
  to?: string;
  value?: CoinbaseValueLike | null;
  native_value?: CoinbaseValueLike | null;
  token_transfers?: CoinbaseTokenTransfer[] | null;
  network_id?: string | number | null;
};

type CoinbaseTokenTransfer = {
  from?: string | null;
  to?: string | null;
  amount?: string | number | null;
  amount_usd?: string | number | null;
  symbol?: string | null;
  decimals?: number | null;
};

type CoinbaseValueLike = {
  amount?: unknown;
  amount_decimal?: unknown;
  amount_usd?: unknown;
  usd_value?: unknown;
  fiat_value?: unknown;
  amount_usd_value?: unknown;
  decimals?: unknown;
  symbol?: unknown;
};

function normalizeTransaction(
  item: CoinbaseTransactionResource,
  normalizedAddress: string,
): WalletTransaction | null {
  const content = extractContent(item);
  const chain = normalizeChain(content?.network_id ?? item.network_id ?? null);
  const chainMeta = CHAIN_METADATA[chain] ?? { explorer: DEFAULT_EXPLORER, symbol: chain.toUpperCase() };

  const hash = selectHash(item, content);
  if (!hash) {
    return null;
  }

  const timestamp = content?.block_timestamp ?? item.block_timestamp ?? new Date().toISOString();
  const fromAddress = extractAddress(item, content, "from");
  const toAddress = extractAddress(item, content, "to");
  const direction = determineDirection(normalizedAddress, fromAddress, toAddress);

  const transfer = selectPrimaryTransfer(content, normalizedAddress, direction);
  const symbol = normalizeSymbol(transfer?.symbol) ?? chainMeta.symbol;

  const valueUsd = extractUsdValue(item, content, transfer);
  const amount = resolveAmount(item, content, chain, transfer);
  const gasFeeUsd = extractFeeUsd(item, content);

  const counterparty = determineCounterparty({
    direction,
    normalizedAddress,
    fromAddress,
    toAddress,
    fromLabel: extractPartyLabel(item, content, "from"),
    toLabel: extractPartyLabel(item, content, "to"),
    transfer,
  });

  return {
    hash,
    timestamp,
    direction,
    valueUsd,
    amount,
    symbol,
    counterparty: counterparty ?? undefined,
    chain,
    gasFeeUsd,
    explorerUrl: item.transaction_link
      ? item.transaction_link
      : `${chainMeta.explorer}${hash}`,
  };
}

function extractContent(item: CoinbaseTransactionResource): CoinbaseTransactionContent | null {
  const raw = (item as { content?: unknown }).content;
  if (raw && typeof raw === "object") {
    return raw as CoinbaseTransactionContent;
  }
  return null;
}

function selectHash(
  item: CoinbaseTransactionResource,
  content: CoinbaseTransactionContent | null,
): string | null {
  const metadataHash =
    item.metadata && typeof item.metadata === "object"
      ? (item.metadata as { transaction_hash?: unknown }).transaction_hash
      : undefined;

  const candidates = [
    item.hash,
    item.transaction_hash,
    content?.hash,
    metadataHash,
    item.block_hash,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim() !== "") {
      return candidate;
    }
  }

  return null;
}

function selectPrimaryTransfer(
  content: CoinbaseTransactionContent | null,
  normalizedAddress: string,
  direction: WalletTransaction["direction"],
): CoinbaseTokenTransfer | undefined {
  const transfers = Array.isArray(content?.token_transfers)
    ? content!.token_transfers.filter((entry) => entry && typeof entry === "object")
    : [];

  if (transfers.length === 0) {
    return undefined;
  }

  const targetKey = direction === "in" ? "to" : direction === "out" ? "from" : null;
  if (targetKey) {
    const match = transfers.find((transfer) => safeLowerCase((transfer as Record<string, unknown>)[targetKey] as string | null | undefined) === normalizedAddress);
    if (match) {
      return match;
    }
  }

  const fallback = transfers.find((transfer) => {
    const fromMatches = safeLowerCase(transfer.from) === normalizedAddress;
    const toMatches = safeLowerCase(transfer.to) === normalizedAddress;
    return fromMatches || toMatches;
  });

  return fallback ?? (transfers[0] as CoinbaseTokenTransfer);
}

function extractAddress(
  item: CoinbaseTransactionResource,
  content: CoinbaseTransactionContent | null,
  key: "from" | "to",
): string | null {
  const direct = (item as Record<string, unknown>)[key];
  if (direct && typeof direct === "object") {
    const address = (direct as { address?: unknown }).address;
    if (typeof address === "string" && address.trim() !== "") {
      return address;
    }
  }

  const contentValue = content && typeof content[key] === "string" ? (content[key] as string) : undefined;
  if (contentValue && contentValue.trim() !== "") {
    return contentValue;
  }

  const transferAddress = selectAddressFromTransfers(content, key);
  return transferAddress ?? null;
}

function selectAddressFromTransfers(
  content: CoinbaseTransactionContent | null,
  key: "from" | "to",
): string | undefined {
  if (!content || !Array.isArray(content.token_transfers)) {
    return undefined;
  }

  for (const entry of content.token_transfers) {
    if (entry && typeof entry === "object") {
      const value = (entry as Record<string, unknown>)[key];
      if (typeof value === "string" && value.trim() !== "") {
        return value;
      }
    }
  }

  return undefined;
}

function extractPartyLabel(
  item: CoinbaseTransactionResource,
  content: CoinbaseTransactionContent | null,
  key: "from" | "to",
): string | null {
  const party = (item as Record<string, unknown>)[key];
  if (party && typeof party === "object") {
    const label = (party as { label?: unknown }).label;
    if (typeof label === "string" && label.trim() !== "") {
      return label;
    }
    const address = (party as { address?: unknown }).address;
    if (typeof address === "string" && address.trim() !== "") {
      return address;
    }
  }

  const contentValue = content && typeof content[key] === "string" ? (content[key] as string) : undefined;
  if (contentValue && contentValue.trim() !== "") {
    return contentValue;
  }

  const transferAddress = selectAddressFromTransfers(content, key);
  return transferAddress ?? null;
}

function determineDirection(
  normalizedAddress: string,
  fromAddress: string | null,
  toAddress: string | null,
): WalletTransaction["direction"] {
  const normalizedFrom = safeLowerCase(fromAddress);
  const normalizedTo = safeLowerCase(toAddress);

  if (normalizedTo === normalizedAddress) {
    return "in";
  }
  if (normalizedFrom === normalizedAddress) {
    return "out";
  }
  return "internal";
}

function determineCounterparty(params: {
  direction: WalletTransaction["direction"];
  normalizedAddress: string;
  fromAddress: string | null;
  toAddress: string | null;
  fromLabel: string | null;
  toLabel: string | null;
  transfer?: CoinbaseTokenTransfer;
}): string | null {
  const { direction, normalizedAddress, fromAddress, toAddress, fromLabel, toLabel, transfer } = params;

  const transferFrom = sanitizeCounterparty(transfer?.from, normalizedAddress);
  const transferTo = sanitizeCounterparty(transfer?.to, normalizedAddress);

  if (direction === "in") {
    return transferFrom ?? fromLabel ?? fromAddress ?? null;
  }
  if (direction === "out") {
    return transferTo ?? toLabel ?? toAddress ?? null;
  }
  return transferTo ?? transferFrom ?? toLabel ?? fromLabel ?? toAddress ?? fromAddress ?? null;
}

function sanitizeCounterparty(value: string | null | undefined, normalizedAddress: string): string | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  return safeLowerCase(value) === normalizedAddress ? null : value;
}

function extractUsdValue(
  item: CoinbaseTransactionResource,
  content: CoinbaseTransactionContent | null,
  transfer?: CoinbaseTokenTransfer,
): number | null {
  const candidateValues: Array<CoinbaseValueLike | null | undefined> = [
    item.value as CoinbaseValueLike | undefined,
    item.native_value as CoinbaseValueLike | undefined,
    item.fee?.amount as CoinbaseValueLike | undefined,
    content?.value,
    content?.native_value,
  ];

  for (const candidate of candidateValues) {
    const usd = parseUsdFromValue(candidate);
    if (usd != null) {
      return usd;
    }
  }

  if (content && Array.isArray(content.token_transfers)) {
    for (const raw of content.token_transfers) {
      const usd = parseUsdFromValue(raw as CoinbaseValueLike | undefined);
      if (usd != null) {
        return usd;
      }
    }
  }

  if (transfer) {
    const usd = toNumber(transfer.amount_usd);
    if (usd != null) {
      return usd;
    }
  }

  return null;
}

function resolveAmount(
  item: CoinbaseTransactionResource,
  content: CoinbaseTransactionContent | null,
  chain: string,
  transfer?: CoinbaseTokenTransfer,
): number | null {
  const candidateValues: Array<{ value?: CoinbaseValueLike | number | string | null; decimals?: number | null }> = [
    { value: item.value as CoinbaseValueLike | undefined },
    { value: item.native_value as CoinbaseValueLike | undefined },
    { value: item.fee?.amount as CoinbaseValueLike | undefined },
    { value: content?.value },
    { value: content?.native_value },
  ];

  for (const candidate of candidateValues) {
    const amount = parseAmountFromValue(candidate.value, candidate.decimals ?? CHAIN_DECIMALS[chain]);
    if (amount != null) {
      return amount;
    }
  }

  if (transfer) {
    const amountFromTransfer = parseScalarAmount(
      transfer.amount,
      resolveDecimalsHint(toNumber(transfer.decimals), chain),
    );
    if (amountFromTransfer != null) {
      return amountFromTransfer;
    }
  }

  return null;
}

function extractFeeUsd(
  item: CoinbaseTransactionResource,
  content: CoinbaseTransactionContent | null,
): number | null {
  const direct = toNumber(item.fee?.amount_usd ?? item.fee?.usd_value);
  if (direct != null) {
    return direct;
  }

  const amountBased = parseUsdFromValue(item.fee?.amount as CoinbaseValueLike | undefined);
  if (amountBased != null) {
    return amountBased;
  }

  if (content && content.token_transfers) {
    for (const transfer of content.token_transfers) {
      const usd = parseUsdFromValue(transfer as CoinbaseValueLike | undefined);
      if (usd != null) {
        return usd;
      }
    }
  }

  return null;
}

function parseUsdFromValue(value: CoinbaseValueLike | number | string | null | undefined): number | null {
  if (value == null || typeof value !== "object") {
    return null;
  }

  return (
    toNumber(value.amount_usd) ??
    toNumber(value.usd_value) ??
    toNumber(value.fiat_value) ??
    toNumber(value.amount_usd_value) ??
    null
  );
}

function parseAmountFromValue(
  value: CoinbaseValueLike | number | string | null | undefined,
  decimals?: number | null,
): number | null {
  if (value == null) {
    return null;
  }

  if (typeof value === "number" || typeof value === "string") {
    return parseScalarAmount(value, decimals ?? null);
  }

  if (typeof value === "object") {
    const decimalsHint = resolveDecimalsHint(toNumber((value as CoinbaseValueLike).decimals), undefined, decimals);
    const scalar = parseScalarAmount(
      (value as CoinbaseValueLike).amount ?? (value as CoinbaseValueLike).amount_decimal,
      decimalsHint,
    );
    if (scalar != null) {
      return scalar;
    }
  }

  return null;
}

function resolveDecimalsHint(
  provided?: number | null,
  chain?: string,
  fallback?: number | null,
): number | null {
  if (typeof provided === "number" && Number.isFinite(provided)) {
    return provided;
  }
  if (chain && CHAIN_DECIMALS[chain] != null) {
    return CHAIN_DECIMALS[chain];
  }
  if (typeof fallback === "number" && Number.isFinite(fallback)) {
    return fallback;
  }
  return null;
}

function parseScalarAmount(raw: unknown, decimals?: number | null): number | null {
  if (raw == null) {
    return null;
  }

  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null;
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") {
      return null;
    }

    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) {
      return null;
    }

    if (trimmed.includes(".") || decimals == null) {
      return numeric;
    }

    const divisor = Math.pow(10, decimals);
    if (!Number.isFinite(divisor) || divisor === 0) {
      return numeric;
    }
    return numeric / divisor;
  }

  return null;
}

function normalizeChain(networkId: string | number | null | undefined): string {
  if (networkId == null) {
    return "eth";
  }

  const key = String(networkId).toLowerCase();
  return CHAIN_ALIAS_MAP[key] ?? key;
}

function normalizeSymbol(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed.toUpperCase();
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    if (value.trim() === "") {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function safeLowerCase(value: string | null | undefined): string | null {
  return typeof value === "string" ? value.toLowerCase() : null;
}
