import bundleAnalyzer from "@next/bundle-analyzer";
import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use standalone output for cleaner CI artifacts and production deployment
  output: "standalone",

  transpilePackages: ["ai", "@ku0/shared"],

  // Optimize large package imports for better tree-shaking
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "framer-motion",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
    ],
  },

  // Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          // Required for SQLite WASM (OPFS)
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "require-corp",
          },
        ],
      },
    ];
  },

  // Redirects for legacy routes → new IA
  async redirects() {
    return [
      {
        source: "/:locale/app",
        destination: "/:locale/unread",
        permanent: true,
      },
      {
        source: "/:locale/inbox",
        destination: "/:locale/unread",
        permanent: true,
      },
      {
        source: "/:locale/reader",
        destination: "/:locale/library",
        permanent: true,
      },
    ];
  },

  // Disable source maps in production for security
  productionBrowserSourceMaps: false,

  // Image optimization
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
  },

  // Strict mode for better React practices
  reactStrictMode: true,

  // Reduce bundle size by excluding unnecessary locales
  i18n: undefined, // Using next-intl instead

  // Enable gzip compression
  compress: true,

  webpack(config) {
    // Loro ships wasm that webpack needs explicitly enabled.
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
      topLevelAwait: true,
    };
    config.output.environment = {
      ...config.output.environment,
      asyncFunction: true,
    };

    if (config.module?.rules) {
      config.module.rules.push({
        test: /\.wasm$/,
        type: "webassembly/async",
      });
    }

    return config;
  },
};

// Wrap with Sentry config
const sentryConfig = withSentryConfig(
  withBundleAnalyzer(withNextIntl(nextConfig)),
  {
    // Sentry options
    silent: true, // Suppresses Sentry CLI logs
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
  },
  {
    // Sentry webpack plugin options
    widenClientFileUpload: true,
    hideSourceMaps: true,
    disableLogger: true,
  }
);

export default sentryConfig;
