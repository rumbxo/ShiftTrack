"use client";

import { useEffect } from "react";

/** Keep open tabs consistent when an email callback changes the shared cookies. */
export function AuthIdentitySync({ userId }: { userId: string }) {
  useEffect(() => {
    const identityKey = "shifttrack-auth-identity";
    let checking = false;
    let disposed = false;

    try {
      if (localStorage.getItem(identityKey) !== userId) localStorage.setItem(identityKey, userId);
    } catch { /* Focus checks still work if browser storage is unavailable. */ }

    async function verifyOnFocus() {
      if (document.visibilityState === "hidden" || checking) return;
      checking = true;
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (response.ok) {
          const session = await response.json();
          if (!disposed && session.userId !== userId) window.location.reload();
        }
      } catch { /* A network interruption should not discard an open form. */ }
      finally { checking = false; }
    }

    const onStorage = (event: StorageEvent) => {
      if ((event.key === identityKey && event.newValue !== userId) || event.key === "shifttrack-auth-change") window.location.reload();
    };
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) void verifyOnFocus(); };
    window.addEventListener("focus", verifyOnFocus);
    document.addEventListener("visibilitychange", verifyOnFocus);
    window.addEventListener("storage", onStorage);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      disposed = true;
      window.removeEventListener("focus", verifyOnFocus);
      document.removeEventListener("visibilitychange", verifyOnFocus);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [userId]);
  return null;
}
