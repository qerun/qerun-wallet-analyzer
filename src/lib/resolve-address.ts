const HEX_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export class AddressResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AddressResolutionError";
  }
}

async function resolveEnsName(name: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.ensideas.com/ens/resolve/${encodeURIComponent(name)}`,
      {
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { address?: string | null };
    const candidate = payload?.address?.trim();

    if (candidate && HEX_ADDRESS_REGEX.test(candidate)) {
      return candidate.toLowerCase();
    }

    return null;
  } catch (error) {
    console.error("Failed to resolve ENS name", { name, error });
    return null;
  }
}

export async function resolveAddress(input: string): Promise<string> {
  const value = input.trim();
  if (!value) {
    throw new AddressResolutionError("Wallet is required");
  }

  if (HEX_ADDRESS_REGEX.test(value)) {
    return value.toLowerCase();
  }

  if (value.endsWith(".eth")) {
    const resolved = await resolveEnsName(value);
    if (resolved) {
      return resolved;
    }
    throw new AddressResolutionError("Unable to resolve ENS name to a wallet address");
  }

  throw new AddressResolutionError("Address must be a 0x-prefixed hex string or ENS name");
}

export function isHexAddress(value: string): boolean {
  return HEX_ADDRESS_REGEX.test(value);
}
