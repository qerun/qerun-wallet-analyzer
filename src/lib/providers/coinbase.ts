import { createPrivateKey } from "crypto";
import { SignJWT, importJWK, importPKCS8, type JWTPayload } from "jose";

const DEFAULT_BASE_URL =
  process.env.COINBASE_API_BASE ?? "https://api.cdp.coinbase.com/platform";
const DEFAULT_NETWORKS = (process.env.COINBASE_NETWORK_IDS ?? "ethereum-mainnet")
  .split(",")
  .map((chain) => chain.trim())
  .filter(Boolean);

export class CoinbaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoinbaseConfigurationError";
  }
}

type CoinbaseApiCredentials = {
  apiKey: string;
  privateKey: string;
};

function requireCredentials(): CoinbaseApiCredentials {
  const apiKey = process.env.COINBASE_API_KEY;
  const privateKey = process.env.COINBASE_API_SECRET;

  if (!apiKey || !privateKey) {
    throw new CoinbaseConfigurationError(
      "COINBASE_API_KEY and COINBASE_API_SECRET must be configured",
    );
  }

  return { apiKey, privateKey };
}

const NETWORK_ID_MAP: Record<string, string> = {
  "ethereum-mainnet": "ethereum-mainnet",
  "eth-mainnet": "ethereum-mainnet",
  ethereum: "ethereum-mainnet",
  eth: "ethereum-mainnet",
  "1": "ethereum-mainnet",
  "eip155:1": "ethereum-mainnet",
  "base-mainnet": "base-mainnet",
  base: "base-mainnet",
  "8453": "base-mainnet",
  "eip155:8453": "base-mainnet",
  "base-sepolia": "base-sepolia",
  "84532": "base-sepolia",
  "eip155:84532": "base-sepolia",
  "polygon-mainnet": "polygon-mainnet",
  polygon: "polygon-mainnet",
  "matic-mainnet": "polygon-mainnet",
  "137": "polygon-mainnet",
  "eip155:137": "polygon-mainnet",
  "arbitrum-one": "arbitrum-one",
  arbitrum: "arbitrum-one",
  "42161": "arbitrum-one",
  "eip155:42161": "arbitrum-one",
  "optimism-mainnet": "optimism-mainnet",
  optimism: "optimism-mainnet",
  "10": "optimism-mainnet",
  "eip155:10": "optimism-mainnet",
  "bnb-mainnet": "bnb-mainnet",
  bsc: "bnb-mainnet",
  "56": "bnb-mainnet",
  "eip155:56": "bnb-mainnet",
  "avalanche-mainnet": "avalanche-mainnet",
  avalanche: "avalanche-mainnet",
  "43114": "avalanche-mainnet",
  "eip155:43114": "avalanche-mainnet",
  "fantom-mainnet": "fantom-mainnet",
  fantom: "fantom-mainnet",
  "250": "fantom-mainnet",
  "eip155:250": "fantom-mainnet",
  "zksync": "zksync",
  "zksync-era": "zksync",
  "324": "zksync",
  "eip155:324": "zksync",
  linea: "linea-mainnet",
  "linea-mainnet": "linea-mainnet",
  "1101": "linea-mainnet",
  "eip155:1101": "linea-mainnet",
  scroll: "scroll-mainnet",
  "scroll-mainnet": "scroll-mainnet",
  "534352": "scroll-mainnet",
  "eip155:534352": "scroll-mainnet",
  metis: "metis-andromeda",
  "metis-andromeda": "metis-andromeda",
  "1088": "metis-andromeda",
  "eip155:1088": "metis-andromeda",
  klaytn: "klaytn-mainnet",
  "8217": "klaytn-mainnet",
  "eip155:8217": "klaytn-mainnet",
  celo: "celo-mainnet",
  "celo-mainnet": "celo-mainnet",
  "42220": "celo-mainnet",
  "eip155:42220": "celo-mainnet",
  moonbeam: "moonbeam-mainnet",
  "1284": "moonbeam-mainnet",
  "eip155:1284": "moonbeam-mainnet",
  moonriver: "moonriver-mainnet",
  "1285": "moonriver-mainnet",
  "eip155:1285": "moonriver-mainnet",
  aurora: "aurora-mainnet",
  "1313161554": "aurora-mainnet",
  "eip155:1313161554": "aurora-mainnet",
  cronos: "cronos-mainnet",
  "25": "cronos-mainnet",
  "eip155:25": "cronos-mainnet",
  gnosis: "gnosis-mainnet",
  xdai: "gnosis-mainnet",
  "100": "gnosis-mainnet",
  "eip155:100": "gnosis-mainnet",
  harmony: "harmony-mainnet",
  "1666600000": "harmony-mainnet",
  "eip155:1666600000": "harmony-mainnet",
};

function toNetworkId(entry: string): string | null {
  if (!entry) {
    return null;
  }

  const lowered = entry.toLowerCase();

  if (NETWORK_ID_MAP[lowered]) {
    return NETWORK_ID_MAP[lowered];
  }

  const eipMatch = lowered.match(/^eip155:(\d+)$/);
  if (eipMatch) {
    return eipMatch[1];
  }

  if (/^\d+$/.test(entry)) {
    return entry;
  }

  return entry;
}

function resolveNetworks(): string[] {
  const resolved = DEFAULT_NETWORKS.map(toNetworkId).filter((val): val is string => Boolean(val));
  return resolved.length > 0 ? resolved : ["ethereum-mainnet"];
}

type CoinbasePagination = {
  cursor?: string | null;
  next_cursor?: string | null;
  has_next?: boolean;
};

type CoinbaseTokenTransfer = {
  from?: string | null;
  to?: string | null;
  value?: string | null;
  contract_address?: string | null;
  token_id?: string | null;
};

type CoinbaseAccessListEntry = {
  address?: string | null;
  storage_keys?: string[] | null;
};

type CoinbaseTransactionResponse = {
  data?: CoinbaseTransactionResource[];
  pagination?: CoinbasePagination | null;
};

export type CoinbaseTransactionResource = {
  hash: string;
  block_hash?: string | null;
  block_height?: number | null;
  block_timestamp?: string | null;
  network_id?: string | null;
  from?: CoinbaseParty | null;
  to?: CoinbaseParty | null;
  parties?: CoinbaseParty[] | null;
  value?: CoinbaseValue | null;
  native_value?: CoinbaseValue | null;
  fee?: CoinbaseFee | null;
  metadata?: Record<string, unknown> | null;
  transaction_hash?: string | null;
  transaction_link?: string | null;
  status?: string | null;
  token_transfers?: CoinbaseTokenTransfer[] | null;
  transaction_access_list?: CoinbaseAccessListEntry[] | null;
};

type CoinbaseParty = {
  address?: string | null;
  label?: string | null;
  direction?: "incoming" | "outgoing" | string | null;
  amount?: CoinbaseValue | null;
};

type CoinbaseValue = {
  amount?: string | number | null;
  symbol?: string | null;
  decimals?: number | null;
  amount_usd?: string | number | null;
  usd_value?: string | number | null;
};

type CoinbaseFee = {
  amount?: CoinbaseValue | null;
  amount_usd?: string | number | null;
  usd_value?: string | number | null;
};

type CoinbaseBalanceResponse = {
  data?: CoinbaseBalanceResource[];
};

export type CoinbaseBalanceResource = {
  network_id?: string | null;
  asset?: {
    address?: string | null;
    asset_id?: string | null;
    symbol?: string | null;
    name?: string | null;
    decimals?: number | null;
    logo?: string | null;
    token_type?: string | null;
    is_verified?: boolean | null;
    is_scam?: boolean | null;
  } | null;
  amount?: string | number | null;
  quantity?: {
    amount?: string | number | null;
    decimals?: number | null;
    amount_decimal?: string | number | null;
  } | null;
  native_balance?: {
    amount?: string | number | null;
    decimals?: number | null;
  } | null;
  value?: CoinbaseValue | null;
  native_value?: CoinbaseValue | null;
  change_24h?: CoinbaseValue | null;
  value_usd?: string | number | null;
};

async function coinbaseFetch<T>(path: string, search: Record<string, string | undefined>) {
  const credentials = requireCredentials();

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${DEFAULT_BASE_URL}${normalizedPath}`);
  Object.entries(search).forEach(([key, value]) => {
    if (value != null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  const method = "GET";
  const token = await buildJwtToken(credentials, url, method);

  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Coinbase API error (${response.status}): ${message}`);
  }

  return (await response.json()) as T;
}

export async function fetchCoinbaseTransactions(address: string) {
  const networks = resolveNetworks();
  const since = new Date();
  since.setDate(since.getDate() - 1);

  const settlements = await Promise.allSettled(
    networks.map((network) => fetchTransactionsForNetwork(address, network)),
  );


  const transactions: CoinbaseTransactionResource[] = [];
  const errors: Error[] = [];

  settlements.forEach((settlement) => {
    if (settlement.status === "fulfilled") {
      transactions.push(...settlement.value);
    } else if (settlement.reason instanceof Error) {
      errors.push(settlement.reason);
    } else {
      errors.push(new Error("Unknown Coinbase transaction error"));
    }
  });

  if (transactions.length === 0 && errors.length > 0) {
    throw errors[0];
  }

  return transactions;
}

async function fetchTransactionsForNetwork(address: string, networkId: string) {
  const items: CoinbaseTransactionResource[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  let safety = 0;

  // https://api.cdp.coinbase.com/platform/v1/networks/{network_id}/addresses/{address_id}/transactions
  do {
    const response = await coinbaseFetch<CoinbaseTransactionResponse>(
      `/v1/networks/${encodeURIComponent(networkId)}/addresses/${encodeURIComponent(address)}/transactions`,
      {
        cursor,
      },
    );

    const batch = Array.isArray(response.data) ? response.data : [];
    console.log(batch[0]);
    batch.forEach((tx) => {
      const normalizedNetwork = tx.network_id ?? networkId;
      let metadataHash = "";
      if (tx.metadata && typeof tx.metadata === "object" && "transaction_hash" in tx.metadata) {
        const candidate = (tx.metadata as { transaction_hash?: unknown }).transaction_hash;
        metadataHash = typeof candidate === "string" ? candidate : "";
      }

      const baseKey =
        tx.hash || metadataHash || `${normalizedNetwork}-${tx.block_hash ?? ""}-${tx.block_height ?? ""}`;
      const dedupeKey = `${normalizedNetwork}:${baseKey}`;

      if (seen.has(dedupeKey)) {
        return;
      }
      seen.add(dedupeKey);

      items.push({
        ...tx,
        network_id: normalizedNetwork,
      });
    });

    const nextCursor =
      response.pagination?.next_cursor ??
      response.pagination?.cursor ??
      undefined;

    if (!nextCursor || nextCursor === cursor) {
      cursor = undefined;
    } else {
      cursor = nextCursor;
    }

    safety += 1;
    if (safety > 25) {
      console.warn("[Coinbase] Pagination safety stop triggered", {
        networkId,
        address,
      });
      break;
    }
  } while (cursor);

  return items;
}

export async function fetchCoinbaseBalances(address: string) {
  const networks = resolveNetworks();

  const settlements = await Promise.allSettled(
    networks.map((network) => fetchBalancesForNetwork(address, network)),
  );

  const balances: CoinbaseBalanceResource[] = [];
  const errors: Error[] = [];

  settlements.forEach((settlement) => {
    if (settlement.status === "fulfilled") {
      balances.push(...settlement.value);
    } else if (settlement.reason instanceof Error) {
      errors.push(settlement.reason);
    } else {
      errors.push(new Error("Unknown Coinbase balance error"));
    }
  });

  if (balances.length === 0 && errors.length > 0) {
    throw errors[0];
  }

  return balances;
}

async function fetchBalancesForNetwork(address: string, networkId: string) {
  const url = `/v1/networks/${encodeURIComponent(networkId)}/addresses/${encodeURIComponent(address)}/balances`;
  const response = await coinbaseFetch<CoinbaseBalanceResponse>(
    url,
    {},
  );

  const balances = Array.isArray(response.data) ? response.data : [];

  return balances.map((balance) => ({
    ...balance,
    network_id: balance.network_id ?? networkId,
  }));
}

async function buildJwtToken(
  credentials: CoinbaseApiCredentials,
  url: URL,
  method: string,
): Promise<string> {
  const uri = `${method} ${url.host}${url.pathname}`;
  const issuedAt = Math.floor(Date.now() / 1000);
  const claims: JWTPayload = {
    sub: credentials.apiKey,
    iss: "cdp",
    aud: ["cdp_service"],
    uris: [uri],
  } as const;

  if (isPemKey(credentials.privateKey)) {
    return buildEcJwt(credentials, claims, issuedAt);
  }
  return buildEdwardsJwt(credentials, claims, issuedAt);
}

async function buildEcJwt(
  credentials: CoinbaseApiCredentials,
  claims: JWTPayload,
  issuedAt: number,
): Promise<string> {
  let pkcs8: string;
  try {
    const pemKey = extractPem(credentials.privateKey);
    const keyObject = createPrivateKey(pemKey);
    pkcs8 = keyObject.export({ type: "pkcs8", format: "pem" }).toString();
  } catch {
    throw new CoinbaseConfigurationError("Unable to parse Coinbase EC private key");
  }

  let ecKey;
  try {
    ecKey = await importPKCS8(pkcs8, "ES256");
  } catch {
    throw new CoinbaseConfigurationError("Unable to import Coinbase EC private key");
  }

  try {
    return await new SignJWT(claims)
      .setProtectedHeader({ alg: "ES256", kid: credentials.apiKey, typ: "JWT", nonce: generateNonce() })
      .setIssuedAt(issuedAt)
      .setNotBefore(issuedAt)
      .setExpirationTime(issuedAt + 60)
      .sign(ecKey);
  } catch {
    throw new CoinbaseConfigurationError("Unable to sign Coinbase JWT with EC key");
  }
}

async function buildEdwardsJwt(
  credentials: CoinbaseApiCredentials,
  claims: JWTPayload,
  issuedAt: number,
): Promise<string> {
  const decoded = Buffer.from(credentials.privateKey, "base64");
  if (decoded.length !== 64) {
    throw new CoinbaseConfigurationError("Coinbase private key must be 64 bytes when base64 encoded");
  }

  const seed = decoded.subarray(0, 32);
  const publicKey = decoded.subarray(32);
  const jwk = {
    kty: "OKP",
    crv: "Ed25519",
    d: seed.toString("base64url"),
    x: publicKey.toString("base64url"),
  } as const;

  let key;
  try {
    key = await importJWK(jwk, "EdDSA");
  } catch {
    throw new CoinbaseConfigurationError("Unable to import Coinbase Ed25519 private key");
  }

  try {
    return await new SignJWT(claims)
      .setProtectedHeader({ alg: "EdDSA", kid: credentials.apiKey, typ: "JWT", nonce: generateNonce() })
      .setIssuedAt(issuedAt)
      .setNotBefore(issuedAt)
      .setExpirationTime(issuedAt + 60)
      .sign(key);
  } catch {
    throw new CoinbaseConfigurationError("Unable to sign Coinbase JWT with Ed25519 key");
  }
}

function generateNonce(length = 16) {
  const digits = "0123456789";
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += digits.charAt(Math.floor(Math.random() * digits.length));
  }
  return result;
}

function isPemKey(value: string) {
  return value.includes("-----BEGIN") && value.includes("PRIVATE KEY");
}

function extractPem(value: string) {
  const trimmed = value.trim();
  if (!isPemKey(trimmed)) {
    throw new CoinbaseConfigurationError("Coinbase private key must be provided in PEM or base64 format");
  }
  return trimmed;
}
