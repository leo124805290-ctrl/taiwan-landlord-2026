import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* 基礎配置 */
  reactStrictMode: true,
  // Next.js 15 已不需要 swcMinify（且會觸發警告）
  poweredByHeader: false,
  generateEtags: true,

  /* 圖片設定 */
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },

  /* 環境變數 */
  env: {
    APP_VERSION: '2.0.0',
    // @ts-ignore - process.env 由 Next.js 提供
    APP_ENV: process.env.NODE_ENV || 'development',
  },

  /* 標頭設定 */
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        {
          key: 'X-DNS-Prefetch-Control',
          value: 'on',
        },
        {
          key: 'X-XSS-Protection',
          value: '1; mode=block',
        },
        {
          key: 'X-Frame-Options',
          value: 'SAMEORIGIN',
        },
        {
          key: 'X-Content-Type-Options',
          value: 'nosniff',
        },
        {
          key: 'Referrer-Policy',
          value: 'strict-origin-when-cross-origin',
        },
      ],
    },
  ],

  /* 重定向（預留） */
  redirects: async () => [
    {
      source: '/old',
      destination: '/',
      permanent: true,
    },
  ],

  /* 重寫規則（API 代理） */
  rewrites: async () => {
    // @ts-ignore - process.env 由 Next.js 提供
    const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'https://taiwan-landlord-2026.zeabur.app';
    
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
      {
        source: '/health',
        destination: `${apiUrl}/health`,
      },
    ];
  },

  /* 實驗性功能 */
  experimental: {
    // 啟用伺服器動作
    serverActions: {
      bodySizeLimit: '2mb',
    },
    // 優化包大小
    optimizePackageImports: ['lucide-react', 'date-fns'],
    // 監聽 next.config.ts 變化
    webpackBuildWorker: true,
  },

  /* 編譯設定 */
  compiler: {
    // 移除 console.log（生產環境）
    // @ts-ignore - process.env 由 Next.js 提供
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },

  /* 輸出設定 */
  output: 'standalone', // 用於 Docker 部署
};

export default nextConfig;