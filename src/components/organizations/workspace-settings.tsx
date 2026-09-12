"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Building2, Check, Cloud, ListChecks, LoaderCircle, RefreshCw, ShieldCheck, UserPlus, Users } from "lucide-react";
import { AuthIdentitySync } from "@/components/auth/auth-identity-sync";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { initials } from "@/lib/tasks/display";
import type { Organization, OrganizationMember } from "@/lib/organizations/types";
import { pauseIdentityChecks } from "@/lib/auth/identity-mutation";

const subscribe = () => () => {};
const roleDescriptions = {
  owner: "Manages the workspace, its members, and all tasks.",
  manager: "Creates, assigns, and completes workspace tasks.",
  employee: "Views the workspace and completes assigned tasks.",
};

export function WorkspaceSettings({ userId, organization, members }: { userId: string; organization: Organization; members: OrganizationMember[] }) {
  const router = useRouter();
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState<OrganizationMember | null>(null);
  const canManage = organization.role === "owner";
  const disabled = !!pending || !hydrated;

  async function mutate(endpoint: string, payload: Record<string, unknown>, action: string) {
    if (pending) return;
    setPending(action);
    setError("");
    const resumeChecks = pauseIdentityChecks();
    let navigating = false;
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 401) { navigating = true; router.replace("/login"); router.refresh(); return; }
        setError(typeof result.error === "string" ? result.error : "We couldn’t save that change. Please try again.");
        return;
      }
      try { localStorage.setItem("shifttrack-organization-change", crypto.randomUUID()); } catch { /* Database changes work without browser storage. */ }
      navigating = true;
      window.location.reload();
    } catch {
      setError("We couldn’t connect. Check your connection and try again.");
    } finally { if (!navigating) resumeChecks(); setPending(""); }
  }

  function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void mutate("/api/organizations/rename", { name: String(data.get("name") ?? "").trim() }, "rename");
  }

  function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void mutate("/api/organizations/members", { email: String(data.get("email") ?? "").trim(), role: String(data.get("role")) }, "add");
  }

  return <div className="organization-shell">
    <AuthIdentitySync userId={userId} organization={organization} />
    <header className="organization-header"><Link href="/dashboard" className="brand" aria-label="ShiftTrack home"><span className="brand-mark"><ListChecks size={23} /></span>ShiftTrack<span className="brand-period">.</span></Link><div className="organization-header-actions"><span className={`role-badge role-${organization.role}`}>{organization.role}</span><SignOutButton /></div></header>
    <main className="organization-main">
      <Link href="/dashboard" className="auth-back"><ArrowLeft size={14} />Back to dashboard</Link>
      <div className="organization-heading"><div><div className="eyebrow">YOUR PEOPLE, ONE PLACE</div><h1>Workspace settings</h1><p>Manage the home your team shares.</p></div><span className="cloud-badge"><Cloud size={15} />Saved online</span></div>
      {error && <div className="auth-error organization-error" role="alert">{error}</div>}
      <div className="organization-grid">
        <div className="organization-primary">
          <section className="panel organization-details"><div className="panel-heading"><div><h2>Organization</h2><p>Your workspace name appears across your team’s accounts.</p></div><Building2 size={22} /></div>
            {canManage ? <form className="organization-form" method="post" action="/api/organizations/rename" onSubmit={rename}><label htmlFor="workspace-name">Organization name<Input id="workspace-name" name="name" defaultValue={organization.name} required minLength={1} maxLength={120} autoComplete="organization" disabled={disabled} /></label><Button type="submit" disabled={disabled}>{pending === "rename" ? <LoaderCircle size={16} className="auth-spinner" /> : <Check size={16} />}Save workspace</Button></form>
              : <div className="organization-readonly"><strong>{organization.name}</strong><p>Your owner manages workspace details and access.</p></div>}
          </section>
          <section className="panel organization-members" aria-labelledby="members-heading"><div className="panel-heading"><div><h2 id="members-heading">Members<span className="count-pill">{members.length}</span></h2><p>Real accounts with access to {organization.name}.</p></div><Button variant="ghost" size="sm" aria-label="Refresh members" onClick={() => window.location.reload()} disabled={disabled}><RefreshCw size={15} /></Button></div>
            <ul className="organization-member-list">{members.map((member) => <li className="organization-member" key={member.id}><span className="organization-avatar">{initials(member.name)}</span><div className="organization-member-identity"><strong>{member.name}{member.userId === userId && <span className="member-you">You</span>}</strong><span>{member.email}</span></div>
              {canManage && member.role !== "owner" ? <form className="organization-member-controls" method="post" action="/api/organizations/members/role" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void mutate("/api/organizations/members/role", { membershipId: member.id, role: String(data.get("role")) }, member.id); }}>
                <select name="role" aria-label={`Role for ${member.email}`} defaultValue={member.role} disabled={disabled}><option value="employee">Employee</option><option value="manager">Manager</option></select>
                <Button size="sm" variant="outline" type="submit" aria-label={`Save role for ${member.email}`} disabled={disabled}>Save role</Button><button className="remove-member" type="button" aria-label={`Remove ${member.email}`} onClick={() => { setError(""); setRemoving(member); }} disabled={disabled}>Remove</button>
              </form> : <span className={`role-badge role-${member.role}`}>{member.role}</span>}
            </li>)}</ul>
          </section>
          {canManage && <section className="panel organization-add"><div className="panel-heading"><div><h2>Add an existing account</h2><p>Your teammate must register, confirm their email, and leave workspace creation to you.</p></div><UserPlus size={23} /></div><form className="organization-form organization-add-form" method="post" action="/api/organizations/members" onSubmit={addMember}><label htmlFor="member-email">Teammate email<Input id="member-email" name="email" type="email" required maxLength={254} placeholder="teammate@example.com" autoComplete="off" disabled={disabled} /></label><label htmlFor="new-member-role">Role<select id="new-member-role" name="role" defaultValue="employee" disabled={disabled}><option value="employee">Employee</option><option value="manager">Manager</option></select></label><Button type="submit" disabled={disabled}>{pending === "add" ? <LoaderCircle size={16} className="auth-spinner" /> : <UserPlus size={16} />}Add member</Button><p className="organization-form-note">This grants access immediately. It doesn’t send an email. Accounts already in another workspace cannot be added.</p></form></section>}
        </div>
        <aside className="organization-aside"><div className="organization-access-card"><span className="organization-card-icon"><ShieldCheck size={23} strokeWidth={1.5} /></span><h2>A clear place for everyone.</h2><p>Access follows your workspace membership.</p><dl>{(["owner", "manager", "employee"] as const).map((role) => <div key={role}><dt>{role.charAt(0).toUpperCase() + role.slice(1)}</dt><dd>{roleDescriptions[role]}</dd></div>)}</dl></div><div className="organization-preview-note"><Users size={19} /><p>Tasks and workspace members are saved online. Assign responsibilities and follow your team’s progress on the dashboard.</p><Link href="/dashboard">Explore the dashboard<ArrowRight size={14} /></Link></div></aside>
      </div>
    </main>
    <Dialog open={!!removing} onOpenChange={(open) => { if (!open && !pending) setRemoving(null); }}><DialogContent><DialogHeader><DialogTitle>Remove workspace access?</DialogTitle><DialogDescription>{removing?.name} will lose access to {organization.name}. Their account will remain available.</DialogDescription></DialogHeader>{error && <p className="auth-error" role="alert">{error}</p>}<DialogFooter><Button variant="outline" onClick={() => setRemoving(null)} disabled={!!pending}>Keep member</Button><Button variant="destructive" disabled={!!pending} onClick={() => { if (removing) void mutate("/api/organizations/members/remove", { membershipId: removing.id }, "remove"); }}>{pending === "remove" ? "Removing…" : "Remove member"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
