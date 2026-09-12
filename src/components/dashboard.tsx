"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Bell, Building2, CalendarDays, Check, CheckCheck, ChevronDown, ChevronRight, CircleCheck, CircleHelp, ClipboardList, Clock3, Flower2, LayoutDashboard, ListChecks, Menu, Plus, Search, Settings, ShieldCheck, SlidersHorizontal, Sparkles, Sun, TriangleAlert, Users, X, BarChart3, Repeat2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { dateLabel, frequencyLabels, initials, localDateInput, taskStatus, type TaskStatus } from "@/lib/tasks/display";
import { useHydrated, useTasks } from "@/lib/tasks/use-tasks";
import type { Task as SavedTask, TaskInput, TaskSnapshot } from "@/lib/tasks/types";
import type { OrganizationMember } from "@/lib/organizations/types";
type WorkspaceUser = { id: string; name: string; email: string };
type Task = SavedTask & { status: TaskStatus };
type Member = OrganizationMember & { initials: string; color: string };
import { SignOutButton } from "@/components/auth/sign-out-button";
import { AuthIdentitySync } from "@/components/auth/auth-identity-sync";
import type { Organization } from "@/lib/organizations/types";

type View = "overview" | "tasks" | "team" | "settings";
type Filter = "all" | Task["status"];
type Modal = "task" | "activity" | "help" | "delete" | null;
const viewLabels: Record<View, string> = { overview: "Overview", tasks: "Tasks", team: "Team", settings: "Settings" };
const categories: TaskInput["category"][] = ["Safety", "Operations", "Documentation", "Maintenance", "Team"];

function Avatar({ member, small = false }: { member?: Member; small?: boolean }) {
  return <span className={`avatar ${small ? "avatar-small" : ""}`} style={{ backgroundColor: `${member?.color ?? "#315b47"}19`, color: member?.color ?? "#315b47" }}>{member?.initials ?? "?"}</span>;
}

function StatusBadge({ status }: { status: Task["status"] }) {
  return <span className={`status-badge status-${status}`}><span />{status.charAt(0).toUpperCase() + status.slice(1)}</span>;
}

export function Dashboard({ user, organization: accountOrganization, initialData }: { user: WorkspaceUser; organization: Organization; initialData: TaskSnapshot }) {
  const workspace = useTasks(initialData);
  const hydrated = useHydrated();
  const tasks: Task[] = workspace.tasks.map((task) => ({ ...task, status: taskStatus(task, workspace.now) }));
  const members: Member[] = workspace.members.map((member) => ({ ...member, initials: initials(member.name), color: "#315b47" }));
  const canManage = accountOrganization.role !== "employee";
  const canComplete = (task: SavedTask) => !task.completedAt && (canManage || task.assigneeId === accountOrganization.membershipId);
  const formatTime = (value: string) => dateLabel(value, hydrated);
  const activity = tasks.flatMap((task) => [
    { id: `${task.id}-created`, taskTitle: task.title, memberId: members.find((member) => member.userId === task.createdBy)?.id, type: task.parentTaskId ? "scheduled" : "created", time: task.createdAt },
    ...(task.completedAt ? [{ id: `${task.id}-completed`, taskTitle: task.title, memberId: members.find((member) => member.userId === task.completedBy)?.id, type: "completed", time: task.completedAt }] : []),
  ]).sort((a, b) => b.time.localeCompare(a.time)).slice(0, 50);
  const name = user.name;
  const completedCount = tasks.filter((task) => task.completedAt).length;
  const stats = { total: tasks.length, completed: completedCount, pending: tasks.filter((task) => task.status === "pending").length, overdue: tasks.filter((task) => task.status === "overdue").length, completionRate: tasks.length ? Math.round(completedCount / tasks.length * 100) : 0 };
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [defaultDue, setDefaultDue] = useState("");
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [view, setView] = useState<View>("overview");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [assignee, setAssignee] = useState("all");
  const [sort, setSort] = useState("status");
  const [modal, setModal] = useState<Modal>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notification, setNotification] = useState("");
  const [formError, setFormError] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId);
  const owner = { ...members[0], name, initials: initials(name) };

  function notify(message: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setNotification(message);
    toastTimer.current = setTimeout(() => setNotification(""), 4500);
  }

  function navigate(nextView: View) {
    setView(nextView);
    setSidebarOpen(false);
    setQuery("");
    setFilter("all");
    setAssignee("all");
  }

  function openModal(next: Modal) { setFormError(""); setModal(next); }

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  function openTask(task: Task | null = null) { setDefaultDue(localDateInput(task ? new Date(task.dueAt) : new Date(Math.ceil((Date.now() + 3600000) / 900000) * 900000))); setEditingTask(task); setSelectedTaskId(null); openModal("task"); }

  async function complete(task: Task) {
    try {
      await workspace.mutate("/api/tasks/complete", { taskId: task.id });
      notify(task.frequency === "once" ? `“${task.title}” completed.` : `“${task.title}” completed. Its next occurrence is scheduled.`);
    } catch (error) { notify(error instanceof Error ? error.message : "This task could not be completed."); }
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFormError("");
    const data = new FormData(event.currentTarget);
    const dueInput = String(data.get("dueAt"));
    const date = new Date(dueInput);
    if (!Number.isFinite(date.getTime()) || localDateInput(date) !== dueInput) {
      setFormError("Choose a valid date and time. That time may not exist during a daylight-saving change."); return;
    }
    const input: TaskInput = {
      title: String(data.get("title") ?? "").trim(), description: String(data.get("description") ?? "").trim(),
      category: String(data.get("category")) as TaskInput["category"], assigneeId: String(data.get("assignee")) || null,
      dueAt: editingTask && dueInput === localDateInput(new Date(editingTask.dueAt)) ? editingTask.dueAt : date.toISOString(), frequency: String(data.get("frequency")) as TaskInput["frequency"],
      timeZone: editingTask?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    try {
      await workspace.mutate(editingTask ? "/api/tasks/update" : "/api/tasks", editingTask ? { ...input, taskId: editingTask.id } : input);
      setModal(null); setQuery(""); setAssignee("all"); setFilter("all");
      notify(editingTask ? "Task changes saved." : "Task created and saved to your workspace.");
    } catch (error) { setFormError(error instanceof Error ? error.message : "This task could not be saved."); }
  }

  async function deleteTask() {
    if (!deletingTask) return;
    try {
      await workspace.mutate("/api/tasks/delete", { taskId: deletingTask.id });
      setModal(null); setDeletingTask(null); notify("Task deleted.");
    } catch (error) { setFormError(error instanceof Error ? error.message : "This task could not be deleted."); }
  }

  const filteredTasks = tasks.filter((task) => {
    const member = members.find((person) => person.id === task.assigneeId);
    return (filter === "all" || task.status === filter) && (assignee === "all" || (assignee === "unassigned" ? !task.assigneeId : task.assigneeId === assignee)) && `${task.title} ${task.category} ${member?.name ?? ""}`.toLowerCase().includes(query.toLowerCase());
  }).sort((a, b) => {
    if (sort === "name") return a.title.localeCompare(b.title);
    if (sort === "time") return (Date.parse(a.dueAt) - Date.parse(b.dueAt));
    const order = { overdue: 0, pending: 1, completed: 2 };
    return order[a.status] - order[b.status] || (Date.parse(a.dueAt) - Date.parse(b.dueAt));
  });
  const displayedTasks = view === "overview" ? filteredTasks.slice(0, 6) : filteredTasks;

  return (
    <div className="app-shell">
      <AuthIdentitySync userId={user.id} organization={accountOrganization} />
      <a className="skip-link" href="#main-content">Skip to content</a>
      {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`} aria-label="Main navigation">
        <button className="brand" onClick={() => navigate("overview")} aria-label="ShiftTrack overview"><span className="brand-mark"><ListChecks size={23} strokeWidth={2.2} /></span>ShiftTrack<span className="brand-period">.</span></button>
        <Link href="/workspace" className="workspace-switch" aria-label="Workspace settings"><span className="workspace-icon"><Building2 size={19} /></span><div><strong>{accountOrganization.name}</strong><span>{accountOrganization.role.charAt(0).toUpperCase() + accountOrganization.role.slice(1)} · Manage workspace</span></div><span className="workspace-indicator" /></Link>
        <div className="nav-label">WORKSPACE</div>
        <nav className="primary-nav">
          <button className={view === "overview" ? "nav-item active" : "nav-item"} onClick={() => navigate("overview")} aria-current={view === "overview" ? "page" : undefined}><LayoutDashboard size={19} />Overview</button>
          <button className={view === "tasks" ? "nav-item active" : "nav-item"} onClick={() => navigate("tasks")} aria-label="Tasks" aria-current={view === "tasks" ? "page" : undefined}><ClipboardList size={19} />Tasks<span className="nav-count">{tasks.length}</span></button>
          <button className={view === "team" ? "nav-item active" : "nav-item"} onClick={() => navigate("team")} aria-current={view === "team" ? "page" : undefined}><Users size={19} />Team</button>
          <button className="nav-item nav-disabled" disabled title="Reports are planned for a later milestone"><BarChart3 size={19} />Reports<span className="soon-badge">Soon</span></button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note"><div className="note-flower"><Flower2 size={26} strokeWidth={1.4} /></div><strong>Good shifts start here.</strong><p>A little organization.<br />A lot more peace of mind.</p><button onClick={() => openModal("help")}>Get to know ShiftTrack <ArrowUpRight size={14} /></button></div>
          <button className={view === "settings" ? "nav-item active" : "nav-item"} onClick={() => navigate("settings")}><Settings size={19} />Settings</button>
          <button className="nav-item" onClick={() => openModal("help")}><CircleHelp size={19} />Help & getting started</button>
          <SignOutButton /><div className="profile"><Avatar member={owner} /><div><strong>{name}</strong><span>{accountOrganization.role.charAt(0).toUpperCase() + accountOrganization.role.slice(1)}</span></div><span className="profile-dot" /></div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb"><button className="mobile-menu icon-button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu size={22} /></button><span className="breadcrumb-workspace">Workspace</span><ChevronRight size={14} /><strong>{viewLabels[view]}</strong></div>
          <div className="topbar-actions"><span className="demo-pill"><span />{workspace.error ? "Refresh needed" : "Saved online"}</span><button className="icon-button" aria-label="Refresh tasks" disabled={!hydrated || workspace.refreshing || workspace.busy} onClick={() => void workspace.refresh()}><RefreshCw size={17} className={workspace.refreshing ? "refresh-spinning" : ""} /></button><span className="topbar-divider" /><button className="notification-button icon-button" aria-label="View recent activity" onClick={() => openModal("activity")}><Bell size={19} /><span /></button><Avatar member={owner} small /></div>
        </header>

        <main id="main-content" className="main-content">
          {workspace.error && <div className="storage-notice" role="alert">{workspace.error} <button disabled={workspace.refreshing || workspace.busy} onClick={() => void workspace.refresh()}>Try again</button></div>}
          <div className="page-heading"><div><div className="eyebrow"><span />YOUR TEAM, IN SYNC</div><h1>{view === "overview" ? <>Welcome back, {name.trim().split(/\s+/)[0]} <Sun className="greeting-sun" size={28} strokeWidth={1.5} /></> : view === "tasks" ? "A clear plan for every shift." : view === "team" ? "Good people. Great teamwork." : "Make yourself at home."}</h1><p>{view === "overview" ? "Your workspace’s tasks, progress, and latest updates." : view === "tasks" ? "The little things that keep your day running smoothly." : view === "team" ? "Keep your people connected and responsibilities clear." : "A few details that make this workspace yours."}</p></div><div className="heading-actions">{view === "overview" && <div className="date-label"><CalendarDays size={16} /><span>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", ...(hydrated ? {} : { timeZone: "UTC" }) }).format(workspace.now)}</span></div>}{(view === "overview" || view === "tasks") && canManage && <Button disabled={!hydrated || workspace.busy} onClick={() => openTask()}><Plus size={17} />Create task</Button>}{view === "team" && accountOrganization.role === "owner" && <Button asChild><Link href="/workspace"><Users size={17} />Manage members</Link></Button>}</div></div>

          {(view === "overview" || view === "tasks") && <>
            <section className="stats-grid" aria-label="Task summary">
              {[
                { label: "Tasks assigned", value: stats.total, foot: "Across your workspace", icon: ClipboardList, tone: "neutral", filter: "all" as Filter },
                { label: "Completed", value: stats.completed, foot: "One task closer to a great shift", icon: CircleCheck, tone: "green", filter: "completed" as Filter },
                { label: "Pending", value: stats.pending, foot: "On your team’s to-do list", icon: Clock3, tone: "amber", filter: "pending" as Filter },
                { label: "Overdue", value: stats.overdue, foot: stats.overdue ? "A little attention needed" : "Everything is on track", icon: TriangleAlert, tone: "coral", filter: "overdue" as Filter },
              ].map(({ label, value, foot, icon: Icon, tone, filter: nextFilter }) => <button className={`stat-card stat-${tone} ${filter === nextFilter && filter !== "all" ? "stat-selected" : ""}`} key={label} onClick={() => setFilter(nextFilter)} aria-label={`Show ${label.toLowerCase()}: ${value}`}><div className="stat-top"><span>{label}</span><span className="stat-icon"><Icon size={18} strokeWidth={1.7} /></span></div><div className="stat-value">{value.toString().padStart(2, "0")}<span>{tone === "green" ? <CheckCheck size={20} /> : tone === "coral" && value > 0 ? <span className="attention-dot" /> : null}</span></div><p>{foot}</p></button>)}
            </section>

            {view === "overview" && tasks.length > 0 && <div className="shift-banner"><div className="banner-symbol"><Sparkles size={20} strokeWidth={1.5} /></div><div><strong>{stats.overdue ? "A small check-in can make a big difference." : "Looking good. Keep the momentum going."}</strong><p>{stats.overdue ? `${stats.overdue} ${stats.overdue === 1 ? "task needs" : "tasks need"} a little follow-up. Help your team finish the day on a high note.` : "Your team is making progress, one completed task at a time."}</p></div><button onClick={() => setFilter(stats.overdue ? "overdue" : "pending")}>{stats.overdue ? "Review overdue" : "See what’s next"}<ArrowRight size={16} /></button></div>}

            <div className={`dashboard-grid ${view === "tasks" ? "tasks-only" : ""}`}>
              <section className="panel tasks-panel" aria-labelledby="tasks-heading">
                <div className="panel-heading"><div><h2 id="tasks-heading">{view === "overview" ? "Workspace tasks" : "All tasks"}<span className="count-pill">{tasks.length}</span></h2><p>A little structure for a smoother day.</p></div><div className="sort-control"><ArrowDown size={14} /><select aria-label="Sort tasks" value={sort} onChange={(event) => setSort(event.target.value)}><option value="status">Priority first</option><option value="time">Due date</option><option value="name">Task name</option></select><ChevronDown size={12} /></div></div>
                <div className="task-tabs" aria-label="Filter by task status">{(["all", "pending", "completed", "overdue"] as Filter[]).map((item) => <button key={item} className={filter === item ? "task-tab selected" : "task-tab"} onClick={() => setFilter(item)} aria-pressed={filter === item}>{item === "all" ? "All tasks" : item.charAt(0).toUpperCase() + item.slice(1)}<span>{item === "all" ? tasks.length : stats[item]}</span></button>)}</div>
                <div className="table-toolbar"><div className="task-search"><Search size={16} /><input aria-label="Search tasks" placeholder="Search tasks…" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button aria-label="Clear search" onClick={() => setQuery("")}><X size={14} /></button>}</div><div className="assignee-filter"><SlidersHorizontal size={14} /><select value={assignee} aria-label="Filter by team member" onChange={(event) => setAssignee(event.target.value)}><option value="all">All members</option><option value="unassigned">Unassigned</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select><ChevronDown size={12} /></div></div>
                <div className="task-table-wrap"><table className="task-table"><thead><tr><th scope="col" className="task-name-heading">Task name</th><th scope="col">Assigned to</th><th scope="col">Due date</th><th scope="col">Status</th></tr></thead><tbody>{displayedTasks.map((task) => {
                  const member = members.find((person) => person.id === task.assigneeId);
                  return <tr key={task.id}><td><div className="task-name-cell"><button className={`task-check ${task.status === "completed" ? "checked" : ""}`} aria-label={task.status === "completed" ? `${task.title} is completed` : `Complete ${task.title}`} disabled={!hydrated || workspace.busy || !canComplete(task)} title={!canComplete(task) && !task.completedAt ? "Only the assigned teammate or a manager can complete this task." : undefined} onClick={() => void complete(task)}>{task.status === "completed" && <Check size={12} strokeWidth={2.7} />}</button><button className="task-title" onClick={() => setSelectedTaskId(task.id)}><strong>{task.title}</strong><span><span className={`category-dot category-${task.category.toLowerCase()}`} />{task.category}<span className="task-meta-separator">·</span><Repeat2 size={10} />{frequencyLabels[task.frequency]}</span></button></div></td><td><span className="table-member"><Avatar member={member} small /><span>{member?.name.split(" ")[0] ?? "Unassigned"}</span></span></td><td><span className={task.status === "overdue" ? "due-time overdue-time task-due-date" : "due-time task-due-date"}>{task.status === "overdue" && <Clock3 size={12} />}{formatTime(task.dueAt)}</span></td><td><StatusBadge status={task.status} /></td></tr>;
                })}</tbody></table>{displayedTasks.length === 0 && <div className="empty-state"><Search size={27} /><h3>No tasks here just yet</h3><p>{query || filter !== "all" || assignee !== "all" ? "Try another search or clear your filters." : canManage ? "Create your first task and give your team a place to start." : "Your owner or manager can create and assign tasks here."}</p>{(query || filter !== "all" || assignee !== "all") && <Button variant="outline" size="sm" onClick={() => { setQuery(""); setFilter("all"); setAssignee("all"); }}>Clear filters</Button>}</div>}</div>
                <div className="table-footer"><span>Showing {displayedTasks.length} of {filteredTasks.length} tasks</span>{view === "overview" ? <button onClick={() => { setView("tasks"); }}>View all tasks<ArrowRight size={14} /></button> : <span className="local-note"><span />{workspace.error ? "Refresh needed" : "Saved online"}</span>}</div>
              </section>

              {view === "overview" && <aside className="insights-column" aria-label="Team progress and activity"><section className="panel progress-panel"><div className="panel-heading"><h2>Every task counts</h2><span className="today-tag">All tasks</span></div><div className="progress-visual"><svg viewBox="0 0 160 160" role="img" aria-label={`${stats.completionRate}% of tasks completed`}><circle className="progress-track" cx="80" cy="80" r="64" /><circle className="progress-arc" cx="80" cy="80" r="64" strokeDasharray={`${stats.completionRate * 4.0212} 402.12`} /></svg><div className="progress-text"><strong>{stats.completionRate}<span>%</span></strong><span>completed</span></div><span className="progress-sparkle"><Sparkles size={17} /></span></div><p className="progress-caption"><strong>{stats.completed} of {stats.total} tasks</strong> checked off. Keep it up!</p><div className="progress-legend"><span><i className="legend-completed" />Completed<b>{stats.completed}</b></span><span><i className="legend-pending" />Remaining<b>{stats.pending + stats.overdue}</b></span></div></section>
                <section className="panel activity-panel"><div className="panel-heading"><h2>Recent activity</h2><span className="live-dot" /></div><div className="activity-list">{activity.length === 0 && <p className="activity-empty">Your team’s first update will appear here.</p>}{activity.slice(0, 3).map((item) => { const member = members.find((person) => person.id === item.memberId); return <div className="activity-item" key={item.id}><span className={`activity-symbol ${item.type === "created" ? "activity-created" : ""}`}>{item.type === "completed" ? <Check size={13} /> : <Plus size={13} />}</span><div><p><strong>{member?.name.split(" ")[0] ?? "Former member"}</strong> {`${item.type} a task`}</p><span>{item.taskTitle}</span><time>{formatTime(item.time)}</time></div></div>; })}</div><button className="activity-more" onClick={() => openModal("activity")}>See all activity<ArrowRight size={14} /></button></section>
              </aside>}
            </div>
          </>}

          {view === "team" && <section className="panel team-panel"><div className="panel-heading"><div><h2>Your team<span className="count-pill">{members.length}</span></h2><p>Everyone has a part in a well-run shift.</p></div><span className="today-tag">Workspace members</span></div><div className="member-grid">{members.map((member) => { const assigned = tasks.filter((task) => task.assigneeId === member.id); return <article className="member-card" key={member.id}><div className="member-card-top"><Avatar member={member} /><span className={`role-badge role-${member.role}`}>{member.role}</span></div><h3>{member.name}</h3><p>{member.email}</p><div className="member-card-stats"><span><strong>{assigned.length}</strong> assigned</span><span><CircleCheck size={14} /><strong>{assigned.filter((task) => task.status === "completed").length}</strong> completed</span></div><button onClick={() => { navigate("tasks"); setAssignee(member.id); }}>View tasks<ArrowUpRight size={15} /></button></article>; })}</div><div className="team-note"><Users size={16} /><span>Owners manage account access in <Link href="/workspace">Workspace settings</Link>. Managers create and assign tasks. Employees complete their assigned tasks.</span></div></section>}

          {view === "settings" && <section className="panel settings-panel"><div className="panel-heading"><div><h2>Workspace settings</h2><p>Your workspace is shared across devices.</p></div><Building2 size={23} /></div><div className="settings-form"><dl className="account-details"><div><dt>Name</dt><dd>{user.name}</dd></div><div><dt>Email</dt><dd>{user.email}</dd></div><div><dt>Workspace</dt><dd>{accountOrganization.name}</dd></div><div><dt>Role</dt><dd>{accountOrganization.role}</dd></div></dl><Button asChild><Link href="/workspace">Open workspace settings<ArrowRight size={16} /></Link></Button><p className="form-hint">Tasks refresh every 30 seconds while this page is visible and when you return to it. Use the refresh button for the latest updates.</p><p className="form-hint">Dates appear in your device’s time zone. A repeating task keeps the time zone chosen when it was created.</p></div></section>}

          <footer className="page-footer"><span><span className="footer-brand-mark"><ListChecks size={14} /></span>A little clarity. A smoother shift.</span><span>Made for the people who keep things moving.<span className="footer-flower">✳</span></span></footer>
        </main>
      </div>

      <Dialog open={modal !== null} onOpenChange={(open) => { if (!open && !workspace.busy) setModal(null); }}>
        <DialogContent className={modal === "activity" ? "activity-dialog" : ""}>
          {modal === "task" && <><DialogHeader><span className="modal-icon"><ClipboardList size={23} /></span><DialogTitle>{editingTask ? "Edit task" : "Create task"}</DialogTitle><DialogDescription>Give your team a clear next step. Changes are saved to your workspace.</DialogDescription></DialogHeader><form className="modal-form" method="post" onSubmit={createTask}><fieldset disabled={!hydrated || workspace.busy} className="task-form-fields"><label>Task name<Input name="title" required maxLength={160} autoFocus defaultValue={editingTask?.title ?? ""} placeholder="e.g. Complete the evening safety check" /></label><label>Description <span className="optional">optional</span><Textarea name="description" maxLength={2000} rows={3} defaultValue={editingTask?.description ?? ""} placeholder="What does your teammate need to know?" /></label><div className="form-row"><label>Category<select name="category" defaultValue={editingTask?.category ?? "Operations"}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label><label>Assign to<select name="assignee" defaultValue={editingTask ? editingTask.assigneeId ?? "" : accountOrganization.membershipId}><option value="">Unassigned</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label></div><div className="form-row"><label>Frequency<select name="frequency" defaultValue={editingTask?.frequency ?? "once"}>{Object.entries(frequencyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Due date and time<Input name="dueAt" type="datetime-local" required min="2000-01-01T00:00" max="2099-12-31T23:59" defaultValue={defaultDue} /></label></div><p className="form-hint">Times entered in {Intl.DateTimeFormat().resolvedOptions().timeZone}. Repeats use {editingTask?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone}.</p><p className="form-hint"><Repeat2 size={14} />Repeating tasks create their next future occurrence when completed. Missed dates are skipped. Choose One-time to stop repeating.</p>{formError && <p className="form-error" role="alert">{formError}</p>}<DialogFooter><Button variant="outline" type="button" onClick={() => setModal(null)}>Cancel</Button><Button type="submit">{workspace.busy ? "Saving…" : editingTask ? "Save changes" : "Create task"}</Button></DialogFooter></fieldset></form></>}
          {modal === "activity" && <><DialogHeader><DialogTitle>The little wins add up.</DialogTitle><DialogDescription>The latest 50 creation and completion updates for your workspace’s tasks.</DialogDescription></DialogHeader><div className="full-activity-list">{activity.length === 0 && <p className="activity-empty">No activity yet. Your first task will start the story.</p>}{activity.map((item) => { const member = members.find((person) => person.id === item.memberId); return <div className="full-activity-item" key={item.id}><Avatar member={member} small /><div><p><strong>{member?.name ?? "Former member"}</strong> {item.type}</p><span>{item.taskTitle}</span></div><time>{formatTime(item.time)}</time></div>; })}</div></>}
          {modal === "help" && <><DialogHeader><span className="modal-icon"><Flower2 size={25} /></span><DialogTitle>A smoother shift starts here.</DialogTitle><DialogDescription>Welcome to your first ShiftTrack workspace.</DialogDescription></DialogHeader><div className="getting-started"><div><span>01</span><div><h3>Give every task a home</h3><p>Owners and managers create tasks, choose a teammate, and set a due date.</p></div></div><div><span>02</span><div><h3>Make progress together</h3><p>Employees complete their assigned tasks. Owners and managers can complete any task in the workspace.</p></div></div><div><span>03</span><div><h3>Keep regular work moving</h3><p>Daily, weekly, and monthly tasks schedule their next occurrence after completion. Overdue work stays open until someone finishes it.</p></div></div></div><div className="help-note"><ShieldCheck size={19} /><p>Tasks and memberships are saved online. Each workspace can access only its own records. Manage your team in Workspace settings.</p></div><DialogFooter><Button onClick={() => setModal(null)}>Let’s get started<ArrowRight size={16} /></Button></DialogFooter></>}
          {modal === "delete" && <><DialogHeader><DialogTitle>Confirm delete</DialogTitle><DialogDescription>Delete “{deletingTask?.title}”? This removes the open task{deletingTask?.frequency !== "once" ? " and stops its future repeats" : ""}. Completed tasks are kept.</DialogDescription></DialogHeader>{formError && <p className="form-error" role="alert">{formError}</p>}<DialogFooter><Button variant="outline" disabled={workspace.busy} onClick={() => setModal(null)}>Keep task</Button><Button disabled={workspace.busy} onClick={() => void deleteTask()}>{workspace.busy ? "Deleting…" : "Delete task"}</Button></DialogFooter></>}

        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedTask} onOpenChange={(open) => { if (!open) setSelectedTaskId(null); }}><DialogContent>{selectedTask && <><DialogHeader><span className="modal-icon"><ClipboardList size={23} /></span><DialogTitle>{selectedTask.title}</DialogTitle><DialogDescription>Everything your teammate needs for this task.</DialogDescription></DialogHeader><div className="task-details"><StatusBadge status={selectedTask.status} /><p>{selectedTask.description || "No additional details for this task."}</p><dl><div><dt>Assigned to</dt><dd>{members.find((member) => member.id === selectedTask.assigneeId)?.name ?? "Unassigned"}</dd></div><div><dt>Due date</dt><dd>{formatTime(selectedTask.dueAt)}</dd></div><div><dt>Frequency</dt><dd>{frequencyLabels[selectedTask.frequency]}</dd></div><div><dt>Category</dt><dd>{selectedTask.category}</dd></div>{selectedTask.completedAt && <div><dt>Completed at</dt><dd>{formatTime(selectedTask.completedAt)}</dd></div>}</dl></div><DialogFooter><Button variant="outline" onClick={() => setSelectedTaskId(null)}>Close</Button>{canManage && !selectedTask.completedAt && <><Button variant="outline" disabled={workspace.busy} onClick={() => { setDeletingTask(selectedTask); setSelectedTaskId(null); openModal("delete"); }}>Delete task</Button><Button variant="outline" disabled={workspace.busy} onClick={() => openTask(selectedTask)}>Edit task</Button></>}{canComplete(selectedTask) && <Button disabled={workspace.busy} onClick={() => void complete(selectedTask)}><Check size={16} />Mark complete</Button>}</DialogFooter></>}</DialogContent></Dialog>
      {notification && <div className="toast" role="status"><span><Check size={15} /></span>{notification}<button aria-label="Dismiss notification" onClick={() => setNotification("")}><X size={15} /></button></div>}
    </div>
  );
}
