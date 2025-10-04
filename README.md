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
COVALENT_API_KEY=your_api_key_here
COVALENT_CHAIN_IDS=eth-mainnet,arbitrum-mainnet,optimism-mainnet
# Optional: override the default Covalent API endpoint
# COVALENT_API_BASE=https://api.covalenthq.com/v1
```

Supplying the Covalent key unlocks live balance analytics at `/api/analyze` and six-month transaction history at `/api/history`. Without it, the dashboard falls back to demo data.

## Deployment

Deploy to Vercel (recommended) or any platform that supports Next.js App Router. Configure environment variables in the hosting dashboard and map the desired subdomain (for example, `analyzer.qerun.com`).
