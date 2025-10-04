import React from "react";
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

type NextImageProps = React.ComponentProps<"img"> & {
  src: string;
  priority?: boolean;
};

type NextLinkProps = React.ComponentProps<"a"> & {
  href: string | URL | { pathname?: string };
  children: React.ReactNode;
};

vi.mock("next/image", () => ({
  default: ({ src, alt, priority: _priority, ...rest }: NextImageProps) => {
    return <img src={src} alt={alt ?? ""} {...rest} />;
  },
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: NextLinkProps) => {
    let resolvedHref = "#";

    if (typeof href === "string") {
      resolvedHref = href;
    } else if (href && typeof href === "object") {
      const candidate = href as { pathname?: unknown; toString?: () => string };

      if (typeof candidate.pathname === "string" && candidate.pathname.length > 0) {
        resolvedHref = candidate.pathname;
      } else if (typeof candidate.toString === "function") {
        resolvedHref = candidate.toString();
      }
    }

    return (
      <a href={resolvedHref} {...rest}>
        {children}
      </a>
    );
  },
}));
