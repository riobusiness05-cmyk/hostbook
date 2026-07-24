"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="w-full rounded-lg border border-black/10 px-3 py-2 text-left text-sm text-neutral-600 hover:bg-neutral-100"
    >
      Log out
    </button>
  );
}
