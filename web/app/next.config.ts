import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Required for the multi-stage Docker build (server.js entry point).
  output: 'standalone',

  // Lint runs in CI; skipping it during `next build` keeps Docker builds fast
  // and prevents stylistic warnings from blocking image creation.
  eslint: { ignoreDuringBuilds: true },

  // TODO: Configure API proxy rewrites once backend services are deployed:
  // async rewrites() {
  //   return [
  //     {
  //       source: '/api/v1/incidents/:path*',
  //       destination: `${process.env.INCIDENT_SERVICE_URL}/api/v1/incidents/:path*`,
  //     },
  //     {
  //       source: '/api/v1/rules/:path*',
  //       destination: `${process.env.RULE_ENGINE_URL}/api/v1/rules/:path*`,
  //     },
  //   ]
  // },
}

export default nextConfig
