/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['libsql-experimental'],
  },
  // Permet de servir le frontend et le backend FastAPI depuis le même domaine
  async rewrites() {
    return [
      // Proxy les appels API vers le backend FastAPI
      {
        source: '/api/:path*',
        destination: 'http://localhost:3000/api/:path*', // En dev, ton backend tourne sur :3000
        // En production, Vercel gérera la route via vercel.json
      },
    ]
  },
}

module.exports = nextConfig
