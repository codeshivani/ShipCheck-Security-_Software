"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getUser } from "@/lib/clientStore";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace(getUser() ? "/dashboard" : "/login");
  }, [router]);

  return <main className="min-h-screen grid place-items-center bg-[#070b10] text-sc-muted">Loading ShipCheck…</main>;
}
