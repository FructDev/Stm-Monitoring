import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/live',
        destination: 'http://localhost:3030/live', // Proxy to Rust Driver to bypass CORS
      },
      {
        source: '/api/curtailment',
        destination: 'http://localhost:3030/curtailment', // Proxy Curtailment POST to Rust
      },
    ];
  },
};

export default nextConfig;
