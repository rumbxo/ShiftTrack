"use client";

import { useEffect } from "react";
import type { Organization } from "@/lib/organizations/types";

function organizationKey(organization: Organization | null) {
  return organization ? JSON.stringify([organization.id, organization.membershipId, organization.role, organization.name]) : "none";
}

/** Keep open tabs consistent when an email callback changes the shared cookies. */
export function AuthIdentitySync({ userId, organization }: { userId: string; organization?: Organization | null }) {
  const expectedOrganization = organization === undefined ? undefined : organizationKey(organization);
  useEffect(() => {
    const identityKey = "shifttrack-auth-identity";
    let checking = false;
    let disposed = false;
    let mutations = 0;
    let controller: AbortController | null = null;

    try {
      if (localStorage.getItem(identityKey) !== userId) localStorage.setItem(identityKey, userId);
    } catch { /* Focus checks still work if browser storage is unavailable. */ }

    async function verifyOnFocus() {
      if (document.visibilityState === "hidden" || checking || mutations > 0) return;
      checking = true;
      controller = new AbortController();
      try {
        const response = await fetch(expectedOrganization === undefined ? "/api/auth/session" : "/api/organizations/context", { cache: "no-store", signal: controller.signal });
        if (response.ok) {
          const session = await response.json();
          if (!disposed && mutations === 0 && !controller.signal.aborted && (session.userId !== userId || (expectedOrganization !== undefined && organizationKey(session.organization ?? null) !== expectedOrganization))) window.location.reload();
        }
      } catch { /* A network interruption should not discard an open form. */ }
      finally { checking = false; }
    }

    const onStorage = (event: StorageEvent) => {
      if ((event.key === identityKey && event.newValue !== userId) || event.key === "shifttrack-auth-change" || (expectedOrganization !== undefined && event.key === "shifttrack-organization-change")) window.location.reload();
    };
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) void verifyOnFocus(); };
    const onMutationStart = () => { mutations += 1; controller?.abort(); };
    const onMutationEnd = () => { mutations = Math.max(0, mutations - 1); };
    window.addEventListener("focus", verifyOnFocus);
    document.addEventListener("visibilitychange", verifyOnFocus);
    window.addEventListener("storage", onStorage);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("shifttrack-identity-mutation-start", onMutationStart);
    window.addEventListener("shifttrack-identity-mutation-end", onMutationEnd);
    void verifyOnFocus();
    return () => {
      disposed = true;
      controller?.abort();
      window.removeEventListener("focus", verifyOnFocus);
      document.removeEventListener("visibilitychange", verifyOnFocus);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("shifttrack-identity-mutation-start", onMutationStart);
      window.removeEventListener("shifttrack-identity-mutation-end", onMutationEnd);
    };
  }, [userId, expectedOrganization]);
  return null;
}
