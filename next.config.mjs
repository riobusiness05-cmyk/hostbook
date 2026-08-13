/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Scoped to just the widget's own public endpoints — the only surface
  // actually designed for cross-origin use (a restaurant's own website
  // embedding the booking widget). This used to blanket-apply to every
  // /api/* route, including cookie-authenticated ones like /api/host/* and
  // /api/hostflow/*, which never needed it: the widget itself already runs
  // same-origin inside its iframe (src="/widget/[slug]"), and the legacy
  // Colonial chat widget calls /api/chat with a same-origin relative fetch.
  // Narrower is just better hygiene for anything that touches a session
  // cookie, even though SameSite=Lax + no Access-Control-Allow-Credentials
  // already close off the practical cross-site attack this could enable.
  async headers() {
    return [
      {
        source: "/api/widget/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type" },
        ],
      },
    ];
  },
};

export default nextConfig;
