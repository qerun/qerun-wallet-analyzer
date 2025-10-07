import {
  CoinbaseConfigurationError,
  fetchCoinbaseBalances,
  type CoinbaseBalanceResource,
} from "@/lib/providers/coinbase";
import {
  buildPriceKey,
  fetchCoinGeckoPrices,
} from "@/lib/pricing/coingecko";

export type AnalysisSummary = {
  netWorth: number;
  netWorthChange: number;
  netWorthChangePct: number;
  realizedPnl: number;
  realizedPnlPct: number;
  riskLevel: "Conservative" | "Moderate" | "Aggressive";
};

export type AnalysisToken = {
  symbol: string;
  protocol: string;
  valueUsd: number;
  change24h: number;
  allocationPct: number;
  amount: number;
  decimals: number;
};

export type AnalysisInsight = {
  title: string;
  detail: string;
  tone: "positive" | "warning" | "neutral";
};

export type WalletAnalysis = {
  summary: AnalysisSummary;
  tokens: AnalysisToken[];
  insights: AnalysisInsight[];
  meta: {
    source: string;
    isFallback: boolean;
  };
};

type ExtendedAnalysisToken = AnalysisToken & { valueUsd24h?: number | null };

const STABLE_SYMBOLS = new Set([
  "USDC",
  "USDT",
  "DAI",
  "TUSD",
  "USDP",
  "USDD",
  "BUSD",
  "LUSD",
  "FRAX",
  "GUSD",
  "EURS",
  "USDN",
  "MIM",
  "CUSDC",
]);

const VALUE_EPSILON = 0.0001;
const MAX_UNVERIFIED_TOKEN_VALUE = 10_000;
const MAX_UNIT_PRICE_FOR_UNVERIFIED = 5_000;

export async function analyzeWallet(address: string): Promise<WalletAnalysis> {
  try {
    const holdings = await fetchCoinbaseBalances(address);
    const priceMap = await fetchCoinGeckoPrices(holdings);

    const tokens = buildTokens(holdings, priceMap);
    const netWorth = tokens.reduce((acc, token) => acc + token.valueUsd, 0);

    const netWorth24h = tokens.reduce(
      (acc, token) => acc + ((token as ExtendedAnalysisToken).valueUsd24h ?? token.valueUsd),
      0,
    );
    const netWorthChange = netWorth - netWorth24h;
    const netWorthChangePct = netWorth24h > VALUE_EPSILON ? (netWorthChange / netWorth24h) * 100 : 0;

    const riskLevel = computeRisk(tokens);
    const insights = buildInsights(tokens, netWorth, netWorthChange, netWorthChangePct, riskLevel);

    const summary: AnalysisSummary = {
      netWorth,
      netWorthChange,
      netWorthChangePct,
      realizedPnl: netWorthChange,
      realizedPnlPct: netWorthChangePct,
      riskLevel,
    };

    return {
      summary,
      tokens,
      insights,
      meta: {
        source: "coinbase",
        isFallback: tokens.length === 0,
      },
    };
  } catch (error) {
    console.error("analyzeWallet failed", error);
    if (error instanceof CoinbaseConfigurationError) {
      throw new Error("Coinbase API credentials are missing or invalid");
    }

    throw error instanceof Error ? error : new Error("Failed to analyze wallet");
  }
}

function buildTokens(
  holdings: CoinbaseBalanceResource[],
  priceMap: Map<string, number>,
): ExtendedAnalysisToken[] {
  const tokens = holdings
    .map((holding) => {
      const chain = normalizeChain(holding.network_id);
      const symbol =
        normalizeSymbol(holding.asset?.symbol) ??
        normalizeSymbol(holding.asset?.asset_id) ??
        chain.toUpperCase();

      const decimals = resolveDecimals(holding);
      const amount = resolveAmount(holding, decimals);
      const priceFromMap = getPriceForHolding(holding, priceMap);
      const valueUsd = extractUsdValue(holding);
      const hasMeaningfulAmount = amount != null && amount > VALUE_EPSILON;
      const effectiveValueUsd = (() => {
        if (priceFromMap != null && hasMeaningfulAmount) {
          return priceFromMap * (amount ?? 0);
        }
        if (valueUsd != null) {
          return valueUsd;
        }
        return 0;
      })();

      if (!hasMeaningfulAmount && effectiveValueUsd < VALUE_EPSILON) {
        return null;
      }

      if (holding.asset?.is_scam) {
        console.warn("[Analyzer] Dropping asset flagged as scam", {
          chain,
          symbol,
          valueUsd: effectiveValueUsd,
        });
        return null;
      }

      const isNative = !holding.asset?.address || holding.asset?.token_type === "native";
      const isVerified = holding.asset?.is_verified ?? true;
      const unitPrice = hasMeaningfulAmount ? effectiveValueUsd / (amount ?? 1) : null;

      if (
        !isNative &&
        !isVerified &&
        (effectiveValueUsd > MAX_UNVERIFIED_TOKEN_VALUE ||
          (unitPrice != null && unitPrice > MAX_UNIT_PRICE_FOR_UNVERIFIED))
      ) {
        console.warn("[Analyzer] Dropping unverified high value token", {
          chain,
          symbol,
          valueUsd: effectiveValueUsd,
          unitPrice,
        });
        return null;
      }

      const valueUsd24h = deriveUsdValue24h(holding, effectiveValueUsd);
      const change24h =
        valueUsd24h && valueUsd24h > VALUE_EPSILON
          ? ((effectiveValueUsd - valueUsd24h) / valueUsd24h) * 100
          : 0;

      const entry: ExtendedAnalysisToken = {
        symbol,
        protocol: chain,
        valueUsd: effectiveValueUsd,
        change24h,
        allocationPct: 0,
        amount: amount ?? 0,
        decimals,
        valueUsd24h,
      };

      return entry;
    })
    .filter((token): token is ExtendedAnalysisToken => token !== null)
    .sort((a, b) => b.valueUsd - a.valueUsd);

  const total = tokens.reduce((acc, token) => acc + token.valueUsd, 0);
  if (total > VALUE_EPSILON) {
    tokens.forEach((token) => {
      token.allocationPct = (token.valueUsd / total) * 100;
    });
  }

  return tokens;
}

function computeRisk(tokens: AnalysisToken[]): AnalysisSummary["riskLevel"] {
  const total = tokens.reduce((acc, token) => acc + token.valueUsd, 0);
  if (total < VALUE_EPSILON) {
    return "Moderate";
  }

  const stableValue = tokens
    .filter((token) => STABLE_SYMBOLS.has(token.symbol.toUpperCase()))
    .reduce((acc, token) => acc + token.valueUsd, 0);

  const stableRatio = stableValue / total;

  if (stableRatio >= 0.4) {
    return "Conservative";
  }
  if (stableRatio >= 0.15) {
    return "Moderate";
  }
  return "Aggressive";
}

function buildInsights(
  tokens: AnalysisToken[],
  netWorth: number,
  netWorthChange: number,
  netWorthChangePct: number,
  riskLevel: AnalysisSummary["riskLevel"],
): AnalysisInsight[] {
  const insights: AnalysisInsight[] = [];

  if (netWorth < VALUE_EPSILON) {
    insights.push({
      title: "No balance detected",
      detail: "We could not find any priced assets for this wallet on the configured chains.",
      tone: "neutral",
    });
    return insights;
  }

  const stableRatio = (() => {
    const stableValue = tokens
      .filter((token) => STABLE_SYMBOLS.has(token.symbol.toUpperCase()))
      .reduce((acc, token) => acc + token.valueUsd, 0);
    return stableValue / netWorth;
  })();

  if (stableRatio >= 0.4) {
    insights.push({
      title: "Stablecoin reserves are strong",
      detail: `Stable assets represent ${(stableRatio * 100).toFixed(1)}% of the portfolio, providing solid downside protection for treasury operations.`,
      tone: "positive",
    });
  } else if (stableRatio <= 0.1) {
    insights.push({
      title: "Low stablecoin coverage",
      detail: `Only ${(stableRatio * 100).toFixed(1)}% of the portfolio sits in stable assets, which may limit runway for liabilities or payroll. Consider rotating a portion into stables.`,
      tone: "warning",
    });
  }

  const topToken = tokens[0];
  if (topToken && topToken.allocationPct >= 45) {
    insights.push({
      title: `${topToken.symbol} dominates exposure`,
      detail: `${topToken.symbol} accounts for ${topToken.allocationPct.toFixed(1)}% of portfolio value. Review diversification to reduce protocol-specific risk.`,
      tone: "warning",
    });
  }

  if (Math.abs(netWorthChange) < VALUE_EPSILON) {
    insights.push({
      title: "Flat daily performance",
      detail: "Portfolio value held steady over the last day. Monitor market catalysts to identify upcoming opportunities.",
      tone: "neutral",
    });
  } else if (netWorthChange > 0) {
    insights.push({
      title: "Positive momentum",
      detail: `Net worth grew by $${formatNumber(Math.abs(netWorthChange))} (${netWorthChangePct.toFixed(2)}%) in the last 24 hours, suggesting recent inflows or price appreciation.`,
      tone: "positive",
    });
  } else {
    insights.push({
      title: "Net worth dipped",
      detail: `Net worth fell by $${formatNumber(Math.abs(netWorthChange))} (${netWorthChangePct.toFixed(2)}%) in the last 24 hours. Consider reviewing recent outflows or market moves.`,
      tone: "warning",
    });
  }

  if (riskLevel === "Conservative" && netWorthChange > 0) {
    insights.push({
      title: "Conservative stance working",
      detail: "Your stable-heavy mix is still capturing upside. Monitor if it remains aligned with treasury targets.",
      tone: "positive",
    });
  }

  return insights;
}

function formatNumber(value: number) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(2)}K`;
  }
  return value.toFixed(2);
}

const CHAIN_ALIAS_MAP: Record<string, string> = {
  eth: "eth",
  ethereum: "eth",
  "1": "eth",
  "eip155:1": "eth",
  "ethereum-mainnet": "eth",
  base: "base",
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
  fantom: "fantom",
  "250": "fantom",
  "eip155:250": "fantom",
  zksync: "zksync",
  "324": "zksync",
  "eip155:324": "zksync",
  "zksync-era": "zksync",
  linea: "linea",
  "1101": "linea",
  "eip155:1101": "linea",
  scroll: "scroll",
  "534352": "scroll",
  "eip155:534352": "scroll",
  metis: "metis",
  "1088": "metis",
  "eip155:1088": "metis",
  klaytn: "klaytn",
  "8217": "klaytn",
  "eip155:8217": "klaytn",
  celo: "celo",
  "42220": "celo",
  "eip155:42220": "celo",
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

function normalizeChain(networkId: string | number | null | undefined): string {
  if (networkId == null) {
    return "eth";
  }

  const key = String(networkId).toLowerCase();
  return CHAIN_ALIAS_MAP[key] ?? key;
}

function resolveDecimals(holding: CoinbaseBalanceResource) {
  return (
    holding.asset?.decimals ??
    holding.quantity?.decimals ??
    holding.native_balance?.decimals ??
    18
  );
}

function resolveAmount(holding: CoinbaseBalanceResource, decimals: number): number | null {
  const directAmount = toNumber(holding.amount);
  if (directAmount != null && holding.asset) {
    if (typeof holding.amount === "string" && !holding.amount.includes(".")) {
      const divisor = Math.pow(10, decimals);
      return divisor === 0 ? directAmount : directAmount / divisor;
    }
    return directAmount;
  }

  const decimalAmount = toNumber(holding.quantity?.amount_decimal);
  if (decimalAmount != null) {
    return decimalAmount;
  }

  const rawAmount = holding.quantity?.amount ?? holding.native_balance?.amount;
  if (rawAmount != null) {
    if (typeof rawAmount === "string") {
      if (rawAmount.includes(".")) {
        const float = Number.parseFloat(rawAmount);
        if (Number.isFinite(float)) {
          return float;
        }
      } else {
        const integer = Number.parseFloat(rawAmount);
        if (Number.isFinite(integer)) {
          const divisor = Math.pow(10, decimals);
          return divisor === 0 ? integer : integer / divisor;
        }
      }
    } else if (typeof rawAmount === "number" && Number.isFinite(rawAmount)) {
      const divisor = Math.pow(10, decimals);
      return divisor === 0 ? rawAmount : rawAmount / divisor;
    }
  }

  return null;
}

function extractUsdValue(holding: CoinbaseBalanceResource): number | null {
  const direct = toNumber(holding.value_usd);
  if (direct != null) {
    return Math.abs(direct);
  }

  const sources = [holding.value, holding.native_value];
  for (const source of sources) {
    if (!source) continue;
    const usd =
      toNumber(source.amount_usd ?? source.usd_value ?? source.amount) ??
      (typeof source.symbol === "string" && source.symbol.toUpperCase() === "USD"
        ? toNumber(source.amount)
        : null);
    if (usd != null) {
      return Math.abs(usd);
    }
  }

  return null;
}

function deriveUsdValue24h(holding: CoinbaseBalanceResource, currentValue: number): number | null {
  const change = holding.change_24h;
  if (!change) {
    return null;
  }

  const changeUsd =
    toNumber(change.amount_usd ?? change.usd_value ?? change.amount) ??
    (typeof change.symbol === "string" && change.symbol.toUpperCase() === "USD"
      ? toNumber(change.amount)
      : null);
  if (changeUsd == null) {
    return null;
  }

  const prior = currentValue - changeUsd;
  return prior > 0 ? prior : null;
}

function normalizeSymbol(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed.toUpperCase();
}

function getPriceForHolding(
  holding: CoinbaseBalanceResource,
  priceMap: Map<string, number>,
): number | null {
  const key = buildPriceKey(holding);
  if (!key) {
    return null;
  }
  return priceMap.get(key) ?? null;
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
