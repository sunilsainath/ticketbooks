/** @type {import('next').NextConfig} */
const isVercel = process.env.VERCEL === "1";

const nextConfig = {
  // `standalone` output is for Docker/self-hosted deploys; Vercel builds natively.
  // NOTE: no serverExternalPackages here - entries leak into the Edge middleware
  // bundle on Vercel ("unsupported modules: nodemailer"). Node-only packages are
  // instead loaded via runtime-gated dynamic imports (see lib/email/provider.ts).
  ...(isVercel ? {} : { output: "standalone" }),
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
