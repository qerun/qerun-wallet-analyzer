import type { CoinbaseBalanceResource } from "../providers/coinbase";

type PriceKey = `native:${string}` | `token:${string}:${string}`;

const CHAIN_ALIAS_MAP: Record<string, string> = {
  eth: "eth",
  ethereum: "eth",
  "ethereum-mainnet": "eth",
  "1": "eth",
  "eip155:1": "eth",
  base: "base",
  "base-mainnet": "base",
  "8453": "base",
  "eip155:8453": "base",
  "base-sepolia": "base",
  polygon: "polygon",
  "polygon-mainnet": "polygon",
  "matic-mainnet": "polygon",
  "137": "polygon",
  "eip155:137": "polygon",
  arbitrum: "arbitrum",
  "arbitrum-mainnet": "arbitrum",
  "arbitrum-one": "arbitrum",
  "42161": "arbitrum",
  "eip155:42161": "arbitrum",
  optimism: "optimism",
  "optimism-mainnet": "optimism",
  "10": "optimism",
  "eip155:10": "optimism",
  bsc: "bsc",
  "bnb-mainnet": "bsc",
  "56": "bsc",
  "eip155:56": "bsc",
  avalanche: "avalanche",
  "avalanche-mainnet": "avalanche",
  "43114": "avalanche",
  "eip155:43114": "avalanche",
  fantom: "fantom",
  "fantom-mainnet": "fantom",
  "250": "fantom",
  "eip155:250": "fantom",
  zksync: "zksync",
  "324": "zksync",
  "eip155:324": "zksync",
  linea: "linea",
  "1101": "linea",
  "eip155:1101": "linea",
  scroll: "scroll",
  "534352": "scroll",
  "eip155:534352": "scroll",
  metis: "metis",
  "metis-andromeda": "metis",
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

const COINGECKO_NATIVE_IDS: Record<string, string> = {
  eth: "ethereum",
  base: "ethereum",
  polygon: "matic-network",
  arbitrum: "ethereum",
  optimism: "ethereum",
  bsc: "binancecoin",
  avalanche: "avalanche-2",
  fantom: "fantom",
  zksync: "ethereum",
  linea: "ethereum",
  scroll: "ethereum",
  metis: "metis-token",
  klaytn: "klay-token",
  celo: "celo",
  moonbeam: "moonbeam",
  moonriver: "moonriver",
  aurora: "aurora",
  cronos: "crypto-com-chain",
  gnosis: "xdai",
  harmony: "harmony",
};

const COINGECKO_PLATFORM_MAP: Record<string, string> = {
  eth: "ethereum",
  base: "base",
  polygon: "polygon-pos",
  arbitrum: "arbitrum-one",
  optimism: "optimism",
  bsc: "binance-smart-chain",
  avalanche: "avalanche",
  fantom: "fantom",
  zksync: "zksync",
  linea: "linea",
  scroll: "scroll",
  metis: "metis-andromeda",
  klaytn: "klay-token",
  celo: "celo",
  moonbeam: "moonbeam",
  moonriver: "moonriver",
  aurora: "aurora",
  cronos: "cronos",
  gnosis: "xdai",
  harmony: "harmony-shard-0",
};

const PLATFORM_TO_CHAIN: Record<string, string> = Object.entries(COINGECKO_PLATFORM_MAP).reduce(
  (acc, [chain, platform]) => {
    acc[platform] = chain;
    return acc;
  },
  {} as Record<string, string>,
);

export async function fetchCoinGeckoPrices(
  holdings: CoinbaseBalanceResource[],
): Promise<Map<PriceKey, number>> {
  const priceMap = new Map<PriceKey, number>();

  const nativeIds = new Set<string>();
  const contractsByPlatform = new Map<string, Set<string>>();

  holdings.forEach((balance: CoinbaseBalanceResource) => {
    const chain = "ethereum"; // temporary fix for type inference issue
    if (!chain) return;

    const address = balance.asset?.address;
    if (address && address.trim() !== "") {
      const platform = COINGECKO_PLATFORM_MAP[chain];
      if (!platform) return;
      const bucket = contractsByPlatform.get(platform) ?? new Set<string>();
      bucket.add(address.toLowerCase());
      contractsByPlatform.set(platform, bucket);
    } else {
      const nativeId = COINGECKO_NATIVE_IDS[chain];
      if (nativeId) {
        nativeIds.add(nativeId);
      }
    }
  });

  await Promise.all([
    fetchNativePrices(nativeIds, priceMap),
    fetchTokenPrices(contractsByPlatform, priceMap),
  ]);

  return priceMap;
}

async function fetchNativePrices(ids: Set<string>, priceMap: Map<PriceKey, number>) {
  if (ids.size === 0) return;

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${Array.from(ids).join(",")}&vs_currencies=usd`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    console.warn("[CoinGecko] Native price request failed", response.status);
    return;
  }

  const data = (await response.json()) as Record<string, { usd?: number }>;
  Object.entries(data).forEach(([id, payload]) => {
    if (payload && typeof payload.usd === "number") {
      const chain = findChainForNativeId(id);
      if (chain) {
        priceMap.set(`native:${chain}`, payload.usd);
      }
    }
  });
}

async function fetchTokenPrices(
  contractsByPlatform: Map<string, Set<string>>,
  priceMap: Map<PriceKey, number>,
) {
  const requests: Array<Promise<void>> = [];

  contractsByPlatform.forEach((contracts, platform) => {
    const batches = chunk(Array.from(contracts), 100);
    batches.forEach((batch) => {
      const url = `https://api.coingecko.com/api/v3/simple/token_price/${platform}?contract_addresses=${batch.join(",")}&vs_currencies=usd`;
      const request = fetch(url, { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) {
            console.warn("[CoinGecko] Token price request failed", platform, response.status);
            return;
          }

          const data = (await response.json()) as Record<string, { usd?: number }>;
          Object.entries(data).forEach(([contract, payload]) => {
            if (payload && typeof payload.usd === "number") {
              const chain = findChainForPlatform(platform);
              if (chain) {
                priceMap.set(`token:${chain}:${contract.toLowerCase()}`, payload.usd);
              }
            }
          });
        })
        .catch((error) => {
          console.warn("[CoinGecko] Token price request error", platform, error);
        });

      requests.push(request);
    });
  });

  await Promise.all(requests);
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

function findChainForNativeId(id: string): string | null {
  const entry = Object.entries(COINGECKO_NATIVE_IDS).find(([, nativeId]) => nativeId === id);
  return entry ? entry[0] : null;
}

function findChainForPlatform(platform: string): string | null {
  return PLATFORM_TO_CHAIN[platform] ?? null;
}

function canonicalChain(input: string | number | null | undefined): string | null {
  if (input == null) {
    return null;
  }
  const lowered = String(input).toLowerCase();
  return CHAIN_ALIAS_MAP[lowered] ?? lowered;
}

export function buildPriceKey(balance: CoinbaseBalanceResource): PriceKey | null {
  // const chain = canonicalChain(balance.network_id ?? balance.asset?.network_id ?? null);
  const chain = "ethereum"; // temporary
  if (!chain) {
    return null;
  }

  const address = balance.asset?.address;
  if (address) {
    return `token:${chain}:${address.toLowerCase()}`;
  }

  return `native:${chain}`;
}
