import {
  CovalentConfigurationError,
  CovalentBalanceItem,
  CovalentPortfolioPoint,
  fetchCovalentBalances,
  fetchCovalentPortfolio,
} from "@/lib/providers/covalent";

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
    const [balances, portfolioPoints] = await Promise.all([
      fetchCovalentBalances(address),
      fetchCovalentPortfolio(address, 30),
    ]);

    const flatBalances = balances.flatMap((result) =>
      result.items.map((item) => ({ item, chain: result.chain }))
    );

    const tokens = buildTokens(flatBalances);
    const netWorth = tokens.reduce((acc, token) => acc + token.valueUsd, 0);

    const netWorth24h = flatBalances.reduce((acc, { item }) => {
      const value24h = item.quote_24h ?? item.quote ?? 0;
      return acc + (value24h ?? 0);
    }, 0);

    let netWorthChange = netWorth - netWorth24h;
    let netWorthChangePct = netWorth24h > VALUE_EPSILON ? (netWorthChange / netWorth24h) * 100 : 0;

    const netWorthHistory = aggregateNetWorthHistory(portfolioPoints);
    if (netWorthHistory.length > 1) {
      const latest = netWorthHistory[netWorthHistory.length - 1]?.value ?? netWorth;
      const previous = netWorthHistory[netWorthHistory.length - 2]?.value ?? latest;
      netWorthChange = latest - previous;
      netWorthChangePct = previous > VALUE_EPSILON ? (netWorthChange / previous) * 100 : 0;
    }

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
        source: "covalent",
        isFallback: false,
      },
    };
  } catch (error) {
    if (error instanceof CovalentConfigurationError) {
      return fallbackAnalysis();
    }

    console.error("analyzeWallet failed", error);
    return fallbackAnalysis();
  }
}

function buildTokens(entries: Array<{ item: CovalentBalanceItem; chain: string }>): AnalysisToken[] {
  const tokens = entries
    .map(({ item, chain }) => {
      const symbol = item.contract_ticker_symbol ?? item.contract_name ?? "Unknown";
      const valueUsd = item.quote ?? 0;
      if (valueUsd < VALUE_EPSILON) {
        return null;
      }
      const value24h = item.quote_24h ?? item.quote ?? 0;
      const change24h = value24h > VALUE_EPSILON ? ((valueUsd - value24h) / value24h) * 100 : 0;
      return {
        symbol,
        protocol: chain,
        valueUsd,
        change24h,
        allocationPct: 0,
      };
    })
    .filter((token): token is AnalysisToken => token !== null)
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

function aggregateNetWorthHistory(points: CovalentPortfolioPoint[]) {
  const aggregated = new Map<string, number>();

  points.forEach((point) => {
    aggregated.set(point.timestamp, (aggregated.get(point.timestamp) ?? 0) + point.value);
  });

  return Array.from(aggregated.entries())
    .map(([timestamp, value]) => ({ timestamp, value }))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function fallbackAnalysis(): WalletAnalysis {
  return {
    summary: {
      netWorth: 128530,
      netWorthChange: 2640,
      netWorthChangePct: 2.08,
      realizedPnl: 48210,
      realizedPnlPct: 37.2,
      riskLevel: "Moderate",
    },
    tokens: [
      { symbol: "ETH", protocol: "eth-mainnet", valueUsd: 45210, change24h: 1.82, allocationPct: 35.2 },
      { symbol: "USDC", protocol: "arbitrum-mainnet", valueUsd: 31180, change24h: 0.1, allocationPct: 24.3 },
      { symbol: "stETH", protocol: "eth-mainnet", valueUsd: 25560, change24h: 1.32, allocationPct: 19.9 },
      { symbol: "OP", protocol: "optimism-mainnet", valueUsd: 10840, change24h: -0.6, allocationPct: 8.4 },
      { symbol: "GHO", protocol: "eth-mainnet", valueUsd: 7400, change24h: 0.5, allocationPct: 5.8 },
    ],
    insights: [
      {
        title: "Stablecoin buffer is healthy",
        detail:
          "24% of holdings sit in USDC and GHO, giving you 8 months of runway at the current 30-day average outflow. Maintain at least 18% to cover DAO commitments.",
        tone: "positive",
      },
      {
        title: "Rebalance stETH exposure",
        detail:
          "stETH now represents 20% of assets after recent appreciation. Consider shifting 3-5% back into liquid ETH or USDC to keep staking risk within policy.",
        tone: "warning",
      },
      {
        title: "Governance participation opportunity",
        detail:
          "OP voting rewards are live this epoch. Delegating 40% of your OP position could earn an estimated 8% APR while reinforcing Optimism governance goals.",
        tone: "neutral",
      },
    ],
    meta: {
      source: "demo",
      isFallback: true,
    },
  };
}

function formatNumber(value: number) {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  });
}
