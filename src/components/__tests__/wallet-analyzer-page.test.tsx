import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WalletAnalyzerPage from "../wallet-analyzer-page";
import { vi } from "vitest";

describe("WalletAnalyzerPage", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      // @ts-expect-error allow cleanup when fetch was undefined
      delete global.fetch;
    }
  });

  it("shows a validation message when submitting an empty form", async () => {
    render(<WalletAnalyzerPage />);
    const user = userEvent.setup();

    const submitButton = screen.getByRole("button", { name: /run analysis/i });
    await user.click(submitButton);

    expect(await screen.findByText("Enter a wallet or ENS")).toBeInTheDocument();
  });

  it("renders analysis and history details when the API calls succeed", async () => {
    const analyzeResponse = {
      summary: {
        netWorth: 250_000,
        netWorthChange: 5_000,
        netWorthChangePct: 2.5,
        realizedPnl: 12_000,
        realizedPnlPct: 4.2,
        riskLevel: "Moderate" as const,
      },
      tokens: [
        {
          symbol: "QER",
          protocol: "Qerun",
          valueUsd: 150_000,
          change24h: 3.12,
          allocationPct: 60.5,
        },
        {
          symbol: "USDC",
          protocol: "Circle",
          valueUsd: 80_000,
          change24h: 0.5,
          allocationPct: 32.2,
        },
      ],
      insights: [
        {
          title: "Diversification opportunity",
          detail: "Consider rebalancing stable holdings toward higher-yield strategies.",
          tone: "warning" as const,
        },
      ],
      meta: {
        source: "moralis",
      },
    };

    const historyResponse = {
      history: [
        {
          hash: "0xabc",
          timestamp: "2024-05-04T12:00:00Z",
          direction: "in" as const,
          valueUsd: 123.45,
          symbol: "ETH",
          counterparty: "0xabcdefabcdefabcdefabcdefabcdefabcdef",
          chain: "Ethereum",
          gasFeeUsd: 2.5,
          explorerUrl: "https://etherscan.io/tx/0xabc",
        },
      ],
      meta: {
        source: "moralis",
      },
    };

    const mockJsonResponse = <T,>(data: T) =>
      ({
        ok: true,
        json: () => Promise.resolve(data),
      }) as unknown as Response;

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith("/api/analyze")) {
        return Promise.resolve(mockJsonResponse(analyzeResponse));
      }
      if (url.startsWith("/api/history")) {
        return Promise.resolve(mockJsonResponse(historyResponse));
      }
      return Promise.reject(new Error(`Unexpected fetch call to ${url}`));
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    render(<WalletAnalyzerPage />);
    const user = userEvent.setup();
    const input = screen.getByLabelText(/wallet address or ens name/i);

    await user.type(input, "0xabc123def4567890");
    await user.click(screen.getByRole("button", { name: /run analysis/i }));

    expect(await screen.findByText(/analysis ready/i)).toBeInTheDocument();
    expect(await screen.findByText("$250,000")).toBeInTheDocument();
    expect(screen.getAllByText(/powered by moralis/i)).toHaveLength(2);
    expect(screen.getByText("QER")).toBeInTheDocument();
    expect(await screen.findByText(/inbound transfer/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view tx/i })).toHaveAttribute(
      "href",
      "https://etherscan.io/tx/0xabc",
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        "/api/analyze?address=0xabc123def4567890",
        expect.objectContaining({ cache: "no-store" }),
      );
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/history?address=0xabc123def4567890");
    });
  });
});
