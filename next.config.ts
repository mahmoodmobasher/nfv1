import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    const privateDocument = { key: "Cache-Control", value: "private, no-store" };
    return [
      { source: "/crm/:path*", headers: [privateDocument] },
      { source: "/settings", headers: [privateDocument] },
      { source: "/workspace/:path*", headers: [privateDocument] },
    ];
  },
};

export default nextConfig;
