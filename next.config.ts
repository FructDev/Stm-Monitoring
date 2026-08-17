import type { NextConfig } from "next";

const driverBaseUrl = (process.env.SCADA_DRIVER_URL || 'http://127.0.0.1:3030').replace(/\/+$/, '');

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/live',
        destination: `${driverBaseUrl}/live`, // Proxy to Rust Driver to bypass CORS
      },
      {
        source: '/api/curtailment',
        destination: `${driverBaseUrl}/curtailment`, // Proxy Curtailment POST to Rust
      },
    ];
  },
};

export default nextConfig;
