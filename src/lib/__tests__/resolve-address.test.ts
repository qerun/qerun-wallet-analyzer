import { describe, expect, it, afterEach, vi } from "vitest";
import { resolveAddress, AddressResolutionError } from "../resolve-address";

const ORIGINAL_FETCH = global.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  if (ORIGINAL_FETCH) {
    global.fetch = ORIGINAL_FETCH;
  } else {
    // @ts-expect-error reset fetch when it was undefined
    delete global.fetch;
  }
});

describe("resolveAddress", () => {
  it("returns lowercase hex for 0x input", async () => {
    const input = "0xA64BDE7944B03C5C8698EC31B48517D3DE0FD5A7";

    await expect(resolveAddress(input)).resolves.toBe("0xa64bde7944b03c5c8698ec31b48517d3de0fd5a7");
  });

  it("resolves ENS names when API provides an address", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ address: "0x1111111111111111111111111111111111111111" }),
      } as Response),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(resolveAddress("qerun.eth")).resolves.toBe("0x1111111111111111111111111111111111111111");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.ensideas.com/ens/resolve/qerun.eth",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
  });

  it("throws when ENS lookup fails", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ address: null }),
      } as Response),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(resolveAddress("unknown.eth")).rejects.toBeInstanceOf(AddressResolutionError);
  });
});
