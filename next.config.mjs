/**
 * 静态导出配置：用于部署到 GitHub Pages。
 * 如果你的仓库名不是 "couple-ledger"，请把 BASE_PATH 改成你的仓库名（前后都不要带多余斜杠）。
 * 部署到 Vercel / Cloudflare Pages 时不需要 basePath，可以把 NEXT_PUBLIC_BASE_PATH 留空。
 */
const REPO_NAME = process.env.NEXT_PUBLIC_BASE_PATH || '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  basePath: REPO_NAME ? `/${REPO_NAME}` : '',
  assetPrefix: REPO_NAME ? `/${REPO_NAME}/` : undefined,
  trailingSlash: true,
};

export default nextConfig;
