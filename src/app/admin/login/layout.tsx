import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin login — Host Flow",
  description: "Sign in to the Host Flow admin.",
};

export default function AdminLoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
