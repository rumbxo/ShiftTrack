"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { pauseIdentityChecks } from "@/lib/auth/identity-mutation";
import type { TaskSnapshot } from "@/lib/tasks/types";

const subscribeHydration = () => () => {};
export const useHydrated = () => useSyncExternalStore(subscribeHydration, () => true, () => false);

function identity(snapshot: TaskSnapshot) {
  const org = snapshot.organization;
  return JSON.stringify([snapshot.userId, org.id, org.membershipId, org.role, org.name]);
}

/** Server data is authoritative; never persist workspace records in browser storage. */
export function useTasks(initialData: TaskSnapshot) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.parse(initialData.fetchedAt));
  const mounted = useRef(false);
  const mutationPending = useRef(false);
  const request = useRef<AbortController | null>(null);
  const expectedIdentity = identity(initialData);

  const refresh = useCallback(async () => {
    if (request.current || !mounted.current) return;
    const controller = new AbortController();
    request.current = controller;
    setRefreshing(true);
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch("/api/tasks", { cache: "no-store", signal: controller.signal });
      if (!mounted.current || request.current !== controller || controller.signal.aborted) return;
      if (response.status === 401 || response.status === 403) {
        window.location.reload();
        return;
      }
      const result = await response.json();
      if (!mounted.current || request.current !== controller || controller.signal.aborted) return;
      if (result.code === "organization-required") { window.location.reload(); return; }
      if (!response.ok) throw new Error(result.error || "Tasks could not be refreshed. Try again.");
      if (identity(result) !== expectedIdentity) { window.location.reload(); return; }
      setData(result);
      setNow(Date.now());
      setError("");
    } catch {
      if (mounted.current && request.current === controller) setError("Couldn’t refresh your tasks. You’re viewing the last loaded data. Try again.");
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) {
        request.current = null;
        if (mounted.current) setRefreshing(false);
      }
    }
  }, [expectedIdentity]);

  useEffect(() => {
    mounted.current = true;
    const check = () => { if (document.visibilityState !== "hidden" && !mutationPending.current) void refresh(); };
    const onStorage = (event: StorageEvent) => { if (event.key === "shifttrack-tasks-change") check(); };
    const timer = setInterval(() => { setNow(Date.now()); check(); }, 30000);
    window.addEventListener("focus", check);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", check);
    check();
    return () => {
      mounted.current = false;
      request.current?.abort();
      request.current = null;
      clearInterval(timer);
      window.removeEventListener("focus", check);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", check);
    };
  }, [refresh]);

  async function mutate(path: string, input: unknown) {
    if (mutationPending.current) throw new Error("Wait for the current change to finish.");
    mutationPending.current = true;
    setBusy(true);
    // A read started before this write must never replace its refreshed result.
    request.current?.abort();
    request.current = null;
    setRefreshing(false);
    const resumeIdentity = pauseIdentityChecks();
    try {
      const response = await fetch(path, {
        method: "POST", headers: { "Content-Type": "application/json", "X-ShiftTrack-Membership": initialData.organization.membershipId },
        body: JSON.stringify(input), signal: AbortSignal.timeout(15000),
      });
      const result = await response.json().catch(() => {
        throw new Error("We couldn’t confirm this change was saved. Refresh your tasks before trying again.");
      });
      if (!response.ok) {
        if (response.status === 401) { router.replace("/login"); router.refresh(); }
        throw new Error(result.error || "This change could not be saved. Try again.");
      }
      try { localStorage.setItem("shifttrack-tasks-change", crypto.randomUUID()); } catch { /* Other devices and tabs also poll. */ }
      await refresh();
      return result as { taskId?: string; message: string };
    } catch (failure) {
      if (failure instanceof Error && failure.name !== "TypeError" && failure.name !== "TimeoutError") throw failure;
      throw new Error("We couldn’t confirm this change was saved. Refresh your tasks before trying again.");
    } finally {
      mutationPending.current = false;
      resumeIdentity();
      if (mounted.current) setBusy(false);
    }
  }

  return { ...data, now, error, busy, refreshing, refresh, mutate };
}
