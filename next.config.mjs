/** @type {import('next').NextConfig} */
const isVercel = process.env.VERCEL === "1";

const nextConfig = {
  // `standalone` output is for Docker/self-hosted deploys; Vercel builds natively.
  ...(isVercel ? {} : { output: "standalone" }),
  serverExternalPackages: ["nodemailer", "bcryptjs"],
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
