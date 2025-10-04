"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";

type SummaryMetrics = {
  netWorth: number;
  netWorthChange: number;
  netWorthChangePct: number;
  realizedPnl: number;
  realizedPnlPct: number;
  riskLevel: "Conservative" | "Moderate" | "Aggressive";
};

type TokenBreakdown = {
  symbol: string;
  protocol: string;
  valueUsd: number;
  change24h: number;
  allocationPct: number;
};

type Insight = {
  title: string;
  detail: string;
  tone: "positive" | "warning" | "neutral";
};

type AnalyzeResponse = {
  summary: SummaryMetrics;
  tokens: TokenBreakdown[];
  insights: Insight[];
  meta?: {
    source?: string;
    isFallback?: boolean;
  };
};

type WalletHistoryItem = {
  hash: string;
  timestamp: string;
  direction: "in" | "out" | "internal";
  valueUsd: number | null;
  symbol?: string | null;
  counterparty?: string | null;
  chain: string;
  gasFeeUsd: number | null;
  explorerUrl?: string;
};

type HistoryResponse = {
  history: WalletHistoryItem[];
  meta?: {
    source?: string;
    isFallback?: boolean;
  };
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const percentage = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 2,
});

const currencyDetailed = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const dateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default function WalletAnalyzerPage() {
  const [address, setAddress] = useState("");
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [analysisMeta, setAnalysisMeta] = useState<AnalyzeResponse["meta"] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeAddress, setActiveAddress] = useState<string | null>(null);
  const [history, setHistory] = useState<WalletHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyMeta, setHistoryMeta] = useState<HistoryResponse["meta"] | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = address.trim();
    if (!trimmed) {
      setError("Enter a wallet or ENS");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);
    setAnalysisMeta(null);
    setHistory([]);
    setHistoryError(null);
    setHistoryMeta(null);

    try {
      const data = await fetchAnalysis(trimmed);
      setResult(data);
      setAnalysisMeta(data.meta ?? null);
      setActiveAddress(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to analyze wallet right now");
      setResult(null);
      setAnalysisMeta(null);
      setActiveAddress(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!activeAddress) {
      setHistory([]);
      return;
    }

    let cancelled = false;

    const loadHistory = async () => {
      setHistoryLoading(true);
      setHistoryError(null);

      try {
        const response = await fetch(`/api/history?address=${encodeURIComponent(activeAddress)}`);
        if (!response.ok) {
          throw new Error(`History request failed (${response.status})`);
        }

        const payload = (await response.json()) as HistoryResponse;

        if (!cancelled) {
          setHistory(payload.history ?? []);
          setHistoryMeta(payload.meta ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setHistory([]);
          setHistoryMeta(null);
          setHistoryError(err instanceof Error ? err.message : "Unable to fetch history");
        }
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    };

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [activeAddress]);

  const statusPill = useMemo(() => {
    if (isLoading) {
      return { label: "Scanning", className: "bg-[#f7d976]/25 text-[#f9e7a9] border-[#f7d976]/40" };
    }
    if (result) {
      if (analysisMeta?.isFallback) {
        return { label: "Demo preview", className: "bg-[#2d0e0e] text-[#f7d976] border-[#f7d976]/40" };
      }
      return { label: "Analysis Ready", className: "bg-[#f7d976] text-[#2d0e0e] border-transparent" };
    }
    if (error) {
      return { label: "Check Input", className: "bg-[#2d0e0e] text-[#f7d976] border-[#f7d976]/40" };
    }
    return { label: "Awaiting Address", className: "bg-[#1a0906] text-[#f7d976] border-[#f7d976]/25" };
  }, [isLoading, result, error, analysisMeta]);

  return (
    <div className="min-h-screen text-[#f9e7a9]">
      <header className="relative isolate overflow-hidden border-b border-[#f7d976]/20 bg-gradient-to-br from-[#f7d976]/15 via-[#2d0e0e] to-[#080302] pb-16 pt-20">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% -10%, rgba(247,217,118,0.45), transparent 55%), radial-gradient(circle at 80% 0%, rgba(139,0,0,0.4), transparent 60%)",
          }}
        />
        <div className="relative mx-auto flex max-w-6xl flex-col gap-10 px-6 lg:flex-row lg:items-center">
          <div className="flex-1 space-y-8">
            <div className="flex flex-wrap items-center gap-4">
              <Image
                src="/assets/logo.png"
                alt="Qerun crown logo"
                width={96}
                height={96}
                className="rounded-3xl drop-shadow-[0_8px_20px_rgba(247,217,118,0.25)]"
                priority
              />
              <span className="inline-flex items-center gap-2 rounded-full border border-[#f7d976]/40 bg-[#f7d976]/15 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#f9e7a9]">
                Qerun Wallet Analyzer
              </span>
              <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${statusPill.className}`}>
                {statusPill.label}
              </span>
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Understand your on-chain footprint in seconds.
            </h1>
            <p className="max-w-2xl text-base text-[#eadfb7] sm:text-lg">
              Enter a wallet or ENS to benchmark performance, surface risks, and receive AI-generated insights based on live balances and historical activity across supported chains.
            </p>
            <form className="flex w-full flex-col gap-3 rounded-2xl border border-[#f7d976]/20 bg-[#1a0906]/70 p-4 shadow-[0_12px_32px_rgba(0,0,0,0.35)] backdrop-blur sm:flex-row" onSubmit={handleSubmit}>
              <label className="sr-only" htmlFor="wallet-address">
                Wallet address or ENS name
              </label>
              <input
                id="wallet-address"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="vitalik.eth or 0x..."
                className="w-full rounded-xl border border-[#f7d976]/20 bg-[#120806]/70 px-4 py-3 text-sm text-[#f9e7a9] placeholder:text-[#cdbd8b] focus:border-[#f7d976]/60 focus:outline-none focus:ring-2 focus:ring-[#f7d976]/40"
                autoComplete="off"
                disabled={isLoading}
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#f7d976] px-6 py-3 text-sm font-semibold text-[#2d0e0e] transition hover:bg-[#f9e7a9] disabled:cursor-not-allowed disabled:bg-[#d8c171] disabled:text-[#2d0e0e]/70"
                disabled={isLoading}
              >
                {isLoading ? "Analyzing" : "Run Analysis"}
              </button>
            </form>
            {error ? <p className="text-sm text-[#f9a9a9]">{error}</p> : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-12 px-6 py-12">
        <SummarySection summary={result?.summary} loading={isLoading} meta={analysisMeta} />
        <HoldingsSection tokens={result?.tokens ?? []} loading={isLoading} />
        <InsightsSection insights={result?.insights ?? []} loading={isLoading} />
        <HistorySection
          history={history}
          loading={historyLoading}
          error={historyError}
          meta={historyMeta}
        />
      </main>

      <footer className="border-t border-[#f7d976]/20 bg-[#0c0503]/90 py-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 text-xs text-[#c3b58a] sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Qerun DAO — community-owned, security-first finance hub.</p>
          <div className="flex flex-wrap gap-3">
            <Link className="hover:text-[#f7d976]" href="https://github.com/qerun" target="_blank" rel="noreferrer">
              GitHub
            </Link>
            <Link className="hover:text-[#f7d976]" href="https://x.com/qerun_" target="_blank" rel="noreferrer">
              X (Twitter)
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SummarySection({
  summary,
  loading,
  meta,
}: {
  summary?: SummaryMetrics;
  loading: boolean;
  meta: AnalyzeResponse["meta"] | null;
}) {
  const items = summary
    ? [
        {
          label: "Net Worth",
          value: currency.format(summary.netWorth),
          change: `${summary.netWorthChange >= 0 ? "+" : ""}${currency.format(Math.abs(summary.netWorthChange)).replace("$", "")}`,
          changePct: summary.netWorthChangePct / 100,
        },
        {
          label: "Realized PnL",
          value: currency.format(summary.realizedPnl),
          change: summary.realizedPnlPct >= 0 ? "Up" : "Down",
          changePct: summary.realizedPnlPct / 100,
        },
        {
          label: "Risk Posture",
          value: summary.riskLevel,
          change: "Diversification rating",
          changePct: 0,
        },
      ]
    : [];

  return (
    <section className="rounded-3xl border border-[#f7d976]/25 bg-[#1a0906]/80 p-8 shadow-[0_20px_40px_rgba(0,0,0,0.35)] backdrop-blur">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <h2 className="text-xl font-semibold text-white">Portfolio Summary</h2>
        {meta?.isFallback ? (
          <span className="inline-flex items-center rounded-full border border-[#f7d976]/30 bg-[#120806]/70 px-3 py-1 text-xs text-[#f7d976]">
            Live data unavailable — check API credentials
          </span>
        ) : meta?.source ? (
          <span className="inline-flex items-center rounded-full border border-[#f7d976]/25 bg-[#120806]/70 px-3 py-1 text-xs text-[#cdbd8b]">
            Powered by {formatDataSource(meta.source)}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-sm text-[#d4c49b]">
        Key metrics across all supported chains including performance, realized gains, and risk stance.
      </p>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {loading ? <SummarySkeleton /> : null}
        {!loading && items.length === 0 ? <EmptyState message="Run an analysis to populate your metrics." /> : null}
        {items.map((item) => (
          <article
            key={item.label}
            className="flex flex-col justify-between rounded-2xl border border-[#f7d976]/25 bg-[#120806]/80 p-6 shadow-[0_12px_32px_rgba(0,0,0,0.25)]"
          >
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-[#f7d976]">{item.label}</h3>
              <p className="mt-3 text-3xl font-semibold text-white">{item.value}</p>
            </div>
            <div className="mt-6 flex items-center justify-between text-xs text-[#cdbd8b]">
              <span>{item.change}</span>
              <span>{percentage.format(item.changePct)}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function HoldingsSection({ tokens, loading }: { tokens: TokenBreakdown[]; loading: boolean }) {
  return (
    <section className="grid gap-6 rounded-3xl border border-[#f7d976]/20 bg-[#1a0906]/75 p-8 shadow-[0_20px_40px_rgba(0,0,0,0.3)] backdrop-blur md:grid-cols-[1fr_1.1fr]">
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-white">Asset Allocation</h2>
        <p className="text-sm text-[#d4c49b]">
          Distribution of holdings by asset and protocol. Chart renders once live data feeds are connected.
        </p>
        <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-[#f7d976]/30 bg-[#120806]/70 text-sm text-[#cdbd8b]">
          <span>{loading ? "Loading chart..." : "Allocation chart will appear here."}</span>
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-[#f7d976]">Top Positions</h3>
        <div className="mt-4 overflow-hidden rounded-2xl border border-[#f7d976]/20">
          <table className="min-w-full divide-y divide-[#f7d976]/15 text-sm">
            <thead className="bg-[#120806]/70 text-[#f9e7a9]">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Asset</th>
                <th className="px-4 py-3 text-right font-medium">Value</th>
                <th className="px-4 py-3 text-right font-medium">24h</th>
                <th className="px-4 py-3 text-right font-medium">Allocation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f7d976]/10 bg-[#1a0906]/80 text-[#eadfb7]">
              {loading ? (
                <tr>
                  <td className="px-4 py-4 text-sm" colSpan={4}>
                    <div className="animate-pulse space-y-2">
                      <div className="h-3 rounded bg-[#f7d976]/20" />
                      <div className="h-3 rounded bg-[#f7d976]/10" />
                    </div>
                  </td>
                </tr>
              ) : tokens.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-sm text-[#cdbd8b]" colSpan={4}>
                    Run an analysis to see per-asset allocations.
                  </td>
                </tr>
              ) : (
                tokens.map((token) => (
                  <tr key={`${token.protocol}-${token.symbol}`}>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-medium text-white">{token.symbol}</span>
                        <span className="text-xs text-[#cdbd8b]">{token.protocol}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-white">{currency.format(token.valueUsd)}</td>
                    <td
                      className={`px-4 py-3 text-right ${token.change24h >= 0 ? "text-[#7ef7bf]" : "text-[#f9a9a9]"}`}
                    >
                      {token.change24h >= 0 ? "+" : ""}
                      {token.change24h.toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 text-right text-[#f7d976]">{token.allocationPct.toFixed(1)}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function InsightsSection({ insights, loading }: { insights: Insight[]; loading: boolean }) {
  return (
    <section className="grid gap-6 rounded-3xl border border-[#f7d976]/20 bg-[#1a0906]/80 p-8 shadow-[0_20px_40px_rgba(0,0,0,0.35)] backdrop-blur lg:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-white">AI Insights</h2>
        <p className="text-sm text-[#d4c49b]">
          Generated descriptions of portfolio health, rebalancing opportunities, and notable risks derived from
          the latest wallet snapshot.
        </p>
        <div className="space-y-4">
          {loading ? (
            <InsightsSkeleton />
          ) : insights.length === 0 ? (
            <EmptyState message="Insights will appear once analysis completes." />
          ) : (
            insights.map((insight) => (
              <article
                key={insight.title}
                className="rounded-2xl border border-[#f7d976]/25 bg-[#120806]/80 p-6 shadow-[0_10px_24px_rgba(0,0,0,0.25)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold text-white">{insight.title}</h3>
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${badgeColor(insight.tone)}`}
                  >
                    {toneLabel(insight.tone)}
                  </span>
                </div>
                <p className="mt-3 text-sm text-[#eadfb7]">{insight.detail}</p>
              </article>
            ))
          )}
        </div>
      </div>
      <aside className="space-y-4 rounded-2xl border border-[#f7d976]/20 bg-[#120806]/70 p-6">
        <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-[#f7d976]">Next Actions</h3>
        <ul className="space-y-3 text-sm text-[#eadfb7]">
          <li>
            • Export metrics to CSV for treasury reporting once available.
          </li>
          <li>
            • Set alert thresholds to be notified when allocation drifts beyond risk policy.
          </li>
          <li>
            • Share the AI summary with contributors directly from the dashboard.
          </li>
        </ul>
      </aside>
    </section>
  );
}

function HistorySection({
  history,
  loading,
  error,
  meta,
}: {
  history: WalletHistoryItem[];
  loading: boolean;
  error: string | null;
  meta: HistoryResponse["meta"] | null;
}) {
  return (
    <section className="rounded-3xl border border-[#f7d976]/20 bg-[#1a0906]/80 p-8 shadow-[0_20px_40px_rgba(0,0,0,0.35)] backdrop-blur">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Recent Activity</h2>
          <p className="mt-1 text-sm text-[#d4c49b]">
            On-chain transfers and interactions across configured networks. Values are converted to USD at execution time.
          </p>
        </div>
        {meta?.isFallback ? (
          <span className="inline-flex items-center rounded-full border border-[#f7d976]/30 bg-[#120806]/70 px-3 py-1 text-xs text-[#f7d976]">
            History unavailable — verify provider access
          </span>
        ) : meta?.source ? (
          <span className="inline-flex items-center rounded-full border border-[#f7d976]/30 bg-[#120806]/70 px-3 py-1 text-xs text-[#cdbd8b]">
            Powered by {formatDataSource(meta.source)}
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-[#f9a9a9]/40 bg-[#2d0e0e]/70 p-4 text-sm text-[#f9a9a9]">
          {error}
        </div>
      ) : null}

      <div className="mt-6 space-y-4">
        {loading ? (
          <HistorySkeleton />
        ) : history.length === 0 ? (
          <EmptyState message="No on-chain activity detected over the last six months." />
        ) : (
          history.slice(0, 12).map((tx) => (
            <article
              key={`${tx.hash}-${tx.timestamp}`}
              className="grid gap-4 rounded-2xl border border-[#f7d976]/25 bg-[#120806]/75 p-5 shadow-[0_12px_32px_rgba(0,0,0,0.25)] md:grid-cols-[minmax(0,0.9fr)_1fr_auto]"
            >
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[#cdbd8b]">
                  {dateTime.format(new Date(tx.timestamp))}
                </p>
                <p className="mt-2 text-2xl font-semibold text-white">{formatHistoryValue(tx.valueUsd)}</p>
              </div>
              <div className="space-y-2 text-sm text-[#eadfb7]">
                <p className="font-medium text-[#f7d976]">{directionLabel(tx.direction)}</p>
                <p>
                  {formatCounterparty(tx.direction, tx.counterparty)}
                  <span className="ml-2 text-xs text-[#cdbd8b]">{tx.chain}</span>
                </p>
                <p className="text-xs text-[#cdbd8b]">
                  Gas paid: {tx.gasFeeUsd != null ? currencyDetailed.format(tx.gasFeeUsd) : "—"}
                </p>
              </div>
              <div className="flex items-end justify-end">
                {tx.explorerUrl ? (
                  <a
                    className="inline-flex items-center gap-2 rounded-full border border-[#f7d976]/40 px-4 py-2 text-xs font-semibold text-[#f7d976] transition hover:border-[#f7d976] hover:text-[#f9e7a9]"
                    href={tx.explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View Tx
                  </a>
                ) : null}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function badgeColor(tone: Insight["tone"]) {
  switch (tone) {
    case "positive":
      return "bg-[#153d2d] text-[#7ef7bf] border border-[#7ef7bf]/40";
    case "warning":
      return "bg-[#402414] text-[#f9c570] border border-[#f9c570]/50";
    default:
      return "bg-[#1f1a17] text-[#f7d976] border border-[#f7d976]/30";
  }
}

function toneLabel(tone: Insight["tone"]) {
  switch (tone) {
    case "positive":
      return "Opportunity";
    case "warning":
      return "Attention";
    default:
      return "Insight";
  }
}

function SummarySkeleton() {
  return (
    <>
      {[0, 1, 2].map((key) => (
        <div key={key} className="animate-pulse rounded-2xl border border-[#f7d976]/10 bg-[#120806]/60 p-6">
          <div className="h-4 w-24 rounded bg-[#f7d976]/20" />
          <div className="mt-6 h-8 w-32 rounded bg-[#f7d976]/15" />
          <div className="mt-8 h-3 w-full rounded bg-[#f7d976]/10" />
        </div>
      ))}
    </>
  );
}

function InsightsSkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1].map((key) => (
        <div key={key} className="animate-pulse rounded-2xl border border-[#f7d976]/15 bg-[#120806]/70 p-6">
          <div className="h-4 w-40 rounded bg-[#f7d976]/20" />
          <div className="mt-4 space-y-3">
            <div className="h-3 w-full rounded bg-[#f7d976]/15" />
            <div className="h-3 w-3/4 rounded bg-[#f7d976]/10" />
            <div className="h-3 w-4/5 rounded bg-[#f7d976]/10" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#f7d976]/25 bg-[#120806]/60 p-6 text-sm text-[#cdbd8b]">
      {message}
    </div>
  );
}

function HistorySkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((key) => (
        <div key={key} className="animate-pulse rounded-2xl border border-[#f7d976]/15 bg-[#120806]/70 p-5">
          <div className="h-3 w-32 rounded bg-[#f7d976]/20" />
          <div className="mt-4 h-6 w-40 rounded bg-[#f7d976]/15" />
          <div className="mt-4 h-3 w-full rounded bg-[#f7d976]/12" />
          <div className="mt-2 h-3 w-2/3 rounded bg-[#f7d976]/10" />
        </div>
      ))}
    </div>
  );
}

function formatHistoryValue(value: number | null) {
  if (value == null) {
    return "—";
  }
  return currencyDetailed.format(value);
}

function formatDataSource(source: string) {
  if (!source) {
    return "";
  }
  return source.charAt(0).toUpperCase() + source.slice(1);
}

function directionLabel(direction: WalletHistoryItem["direction"]) {
  switch (direction) {
    case "in":
      return "Inbound transfer";
    case "out":
      return "Outbound transfer";
    default:
      return "Internal movement";
  }
}

function formatCounterparty(direction: WalletHistoryItem["direction"], counterparty?: string | null) {
  if (!counterparty) {
    return direction === "in" ? "From unknown counterparty" : direction === "out" ? "To unknown counterparty" : "Self interaction";
  }

  const normalized = counterparty.length > 24 ? `${counterparty.slice(0, 10)}…${counterparty.slice(-6)}` : counterparty;
  return direction === "in" ? `From ${normalized}` : direction === "out" ? `To ${normalized}` : `Self: ${normalized}`;
}

async function fetchAnalysis(address: string): Promise<AnalyzeResponse> {
  if (!address.match(/^(0x[a-fA-F0-9]{6,}|[\w-]+\.[a-z]+)$/)) {
    throw new Error("Address looks incorrect. Try checksum hex or ENS.");
  }

  const response = await fetch(`/api/analyze?address=${encodeURIComponent(address)}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    const clone = response.clone();
    let message = `Analysis request failed (${response.status})`;
    try {
      const payload = await clone.json();
      if (payload?.error) {
        message = payload.error;
      }
    } catch {
      try {
        const text = await clone.text();
        if (text) {
          message = text;
        }
      } catch {
        // ignore
      }
    }
    throw new Error(message);
  }

  return (await response.json()) as AnalyzeResponse;
}
