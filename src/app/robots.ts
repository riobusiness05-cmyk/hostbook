import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://hostflow-booking.vercel.app";
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/host/", "/admin/", "/hostflow/admin/"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
