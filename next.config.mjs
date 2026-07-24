/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allows the /widget.js embed script and API routes to be called
  // cross-origin from a client's own website.
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PATCH,DELETE,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
        ],
      },
    ];
  },
};

export default nextConfig;
