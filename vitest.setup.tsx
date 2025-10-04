import React from "react";
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

type NextImageProps = React.ComponentProps<"img"> & {
  src: string;
  priority?: boolean;
};

type NextLinkProps = React.ComponentProps<"a"> & {
  href: string | { pathname: string };
  children: React.ReactNode;
};

vi.mock("next/image", () => ({
  default: ({ src, alt, priority: _priority, ...rest }: NextImageProps) => {
    return <img src={src} alt={alt ?? ""} {...rest} />;
  },
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: NextLinkProps) => {
    const resolvedHref = typeof href === "string" ? href : href.pathname;
    return (
      <a href={resolvedHref} {...rest}>
        {children}
      </a>
    );
  },
}));
