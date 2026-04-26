import type { NextConfig } from "next";

const ngrokDomain = process.env.NGROK_DOMAIN ?? "";

const nextConfig: NextConfig = {
  allowedDevOrigins: ngrokDomain ? [ngrokDomain] : [],
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:3000",
        ...(ngrokDomain ? [ngrokDomain] : []),
      ],
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/**",
      },
    ],
  },
};

export default nextConfig;
