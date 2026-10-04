/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The prepared per-venue email designs live outside src/ and are read
  // from disk by one admin route — tell the bundler to ship them with it.
  experimental: {
    outputFileTracingIncludes: {
      "/api/platform/email-design/prepared": ["./email-designs/**/*"],
    },
  },
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
      // Everything except the embeddable booking widget: never frameable
      // (clickjacking on the host/admin UIs), no MIME sniffing, tight
      // referrer, no legacy browser features we don't use.
      {
        source: "/((?!widget|api/widget).*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
      // The widget is meant to be framed by restaurants' own sites.
      {
        source: "/(widget|api/widget)(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
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
