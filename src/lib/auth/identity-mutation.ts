/** Prevent a background identity check from interrupting this tab's mutation. */
export function pauseIdentityChecks() {
  window.dispatchEvent(new Event("shifttrack-identity-mutation-start"));
  let resumed = false;
  return () => {
    if (resumed) return;
    resumed = true;
    window.dispatchEvent(new Event("shifttrack-identity-mutation-end"));
  };
}
