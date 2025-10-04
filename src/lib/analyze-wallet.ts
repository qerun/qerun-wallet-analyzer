import {
  MoralisConfigurationError,
  MoralisTokenHolding,
  fetchMoralisBalances,
} from "@/lib/providers/moralis";

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

export async function analyzeWallet(address: string): Promise<WalletAnalysis> {
  try {
    const holdings = await fetchMoralisBalances(address);
    const tokens = buildTokens(holdings);
    const netWorth = tokens.reduce((acc, token) => acc + token.valueUsd, 0);

    const netWorth24h = tokens.reduce((acc, token) => acc + ((token as ExtendedAnalysisToken).valueUsd24h ?? token.valueUsd), 0);
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
        source: "moralis",
        isFallback: false,
      },
    };
  } catch (error) {
    console.error("analyzeWallet failed", error);
    if (error instanceof MoralisConfigurationError) {
      throw new Error("Moralis API key is missing or invalid");
    }

    throw error instanceof Error ? error : new Error("Failed to analyze wallet");
  }
}

function buildTokens(holdings: MoralisTokenHolding[]): ExtendedAnalysisToken[] {
  const tokens = holdings
    .map((holding) => {
      const valueUsd = deriveUsdValue(holding);
      if (valueUsd < VALUE_EPSILON) {
        return null;
      }

      const valueUsd24h = holding.usdValue24h ?? null;
      const change24h = valueUsd24h && valueUsd24h > VALUE_EPSILON ? ((valueUsd - valueUsd24h) / valueUsd24h) * 100 : 0;

      const entry: ExtendedAnalysisToken = {
        symbol: holding.symbol,
        protocol: holding.chain,
        valueUsd,
        change24h,
        allocationPct: 0,
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

function deriveUsdValue(holding: MoralisTokenHolding) {
  if (holding.usdValue != null) {
    return holding.usdValue;
  }
  if (holding.usdPrice != null) {
    const decimals = holding.decimals ?? 18;
    const decimalFactor = Math.pow(10, decimals);
    const amount = Number.parseFloat(holding.balance ?? "0") / decimalFactor;
    return amount * holding.usdPrice;
  }
  return 0;
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
  riskLevel: AnalysisSummary["riskLevel"]
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
      detail: `Portfolio value decreased by $${formatNumber(Math.abs(netWorthChange))} (${netWorthChangePct.toFixed(2)}%) over the past day. Review large outflows or underperforming assets.`,
      tone: "warning",
    });
  }

  insights.push({
    title: "Risk posture snapshot",
    detail: `Current allocation maps to a ${riskLevel.toLowerCase()} risk profile. Adjust stablecoin and top-token exposure to match treasury policy.`,
    tone: "neutral",
  });

  return insights;
}

function formatNumber(value: number) {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  });
}
