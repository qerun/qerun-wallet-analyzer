# Qerun Wallet Analyzer

Private Next.js application for analyzing on-chain wallet performance. It provides current balances, historical net worth, asset allocation, and growth metrics across supported chains.

## Getting Started

```bash
npm install
npm run dev
```

Open http://localhost:3000 to access the development build. Update `src/app/page.tsx` to begin building the UI.

## Project Structure

- `src/app` – App Router pages, layouts, and client/server components.
- `src/app/api` – Server-side routes for fetching balances, prices, and history from upstream data providers.
- `src/lib` – Shared utilities for provider integrations, caching, and analytics.
- `public` – Static assets such as icons and logos.

## Environment Variables

Create an `.env.local` file to store API keys for blockchain indexers, pricing APIs, and RPC endpoints. Never commit real credentials.

```env
COINBASE_API_KEY=your_coinbase_access_key
COINBASE_API_SECRET=your_coinbase_private_key
COINBASE_NETWORK_IDS=1,8453
# Optional: override the default Coinbase API endpoint
# COINBASE_API_BASE=https://api.coinbase.com
```

Supplying the Coinbase Onchain credentials unlocks live balance analytics at `/api/analyze` and recent transaction history at `/api/history`. Adjust `COINBASE_NETWORK_IDS` to match the chains available in your plan. Without credentials, the dashboard falls back to demo data.

> **Note**
> `COINBASE_API_SECRET` should be the raw private key from your CDP API key file (either the PEM-formatted EC key or the base64-encoded Ed25519 key).
> You can list networks using numeric IDs (e.g. `1,8453`). Slugs such as `base-mainnet` are also supported and will be converted automatically.

## Deployment

Deploy to Vercel (recommended) or any platform that supports Next.js App Router. Configure environment variables in the hosting dashboard and map the desired subdomain (for example, `analyzer.qerun.com`).
