"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { landingPath } from "@/lib/permissions";
import { useSession } from "@/lib/session";
import { PageSkeleton } from "@/components/layout/skeleton";

export default function PortalIndexPage() {
  const router = useRouter();
  const { me } = useSession();

  useEffect(() => {
    if (me) router.replace(landingPath(me));
  }, [me, router]);

  return <PageSkeleton />;
}
