import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    // Handle PDF.js worker files
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    
    // Copy PDF.js worker files to public directory
    config.module.rules.push({
      test: /\.worker\.js$/,
      use: { loader: 'file-loader', options: { publicPath: '/_next/static/workers/' } }
    });

    return config;
  },
  // Ensure PDF.js worker files are served correctly
  async headers() {
    return [
      {
        source: '/pdf.worker.mjs',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/javascript',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
