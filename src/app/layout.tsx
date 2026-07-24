import type { Metadata } from "next";
import { Cormorant_Garamond, Jost } from "next/font/google";
import "./globals.css";
import { getActiveRestaurant } from "@/lib/restaurant";

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-serif",
  display: "swap",
});

const sans = Jost({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-sans",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  try {
    const restaurant = await getActiveRestaurant();
    return {
      title: `${restaurant.name} — ${restaurant.tagline ?? "Reservations"}`,
      description: restaurant.tagline ?? `Book a table at ${restaurant.name}`,
    };
  } catch {
    return { title: "Host Flow AI Booking" };
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
