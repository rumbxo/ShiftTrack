"use client";

import { useRef, useState, type FormEvent } from "react";
import { ZodError } from "zod";
import { ArrowDown, ArrowRight, ArrowUpRight, Bell, Building2, CalendarDays, Check, CheckCheck, ChevronDown, ChevronRight, CircleCheck, CircleHelp, ClipboardList, Clock3, Flower2, LayoutDashboard, ListChecks, Menu, Plus, Search, Settings, ShieldCheck, SlidersHorizontal, Sparkles, Sun, TriangleAlert, Users, X, BarChart3, Repeat2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatTime, getTaskStats, initials, type Member, type Task, type TaskCategory } from "@/lib/demo-data";
import { useWorkspace } from "@/lib/use-workspace";

type View = "overview" | "tasks" | "team" | "settings";
type Filter = "all" | Task["status"];
type Modal = "task" | "member" | "activity" | "help" | "reset" | null;
const viewLabels: Record<View, string> = { overview: "Overview", tasks: "Tasks", team: "Team", settings: "Settings" };
const categories: TaskCategory[] = ["Safety", "Operations", "Documentation", "Maintenance", "Team"];

function Avatar({ member, small = false }: { member?: Member; small?: boolean }) {
  return <span className={`avatar ${small ? "avatar-small" : ""}`} style={{ backgroundColor: `${member?.color ?? "#315b47"}19`, color: member?.color ?? "#315b47" }}>{member?.initials ?? "AE"}</span>;
}

function StatusBadge({ status }: { status: Task["status"] }) {
  return <span className={`status-badge status-${status}`}><span />{status.charAt(0).toUpperCase() + status.slice(1)}</span>;
}

export function Dashboard() {
  const workspace = useWorkspace();
  const { tasks, members, activity, organization, name } = workspace;
  const stats = getTaskStats(tasks);
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

  function complete(task: Task) {
    workspace.completeTask(task.id);
    notify(`“${task.title}” completed. Nice work!`);
  }

  function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title") ?? "").trim();
    if (!title) { setFormError("Give your task a name to continue."); return; }
    try {
      workspace.addTask({ title, description: String(data.get("description") ?? "").trim(), category: String(data.get("category")) as TaskCategory, assigneeId: String(data.get("assignee")), dueTime: String(data.get("dueTime")), frequency: String(data.get("frequency")) as Task["frequency"] });
    } catch (error) {
      setFormError(error instanceof ZodError ? "Check the task details and choose a valid time and teammate." : error instanceof Error ? error.message : "This task couldn’t be created. Please try again.");
      return;
    }
    setModal(null);
    setQuery(""); setAssignee("all"); setFilter("all");
    notify("Task created and added to your team’s shift.");
  }

  function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const memberName = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim().toLowerCase();
    if (!memberName) { setFormError("Enter a name for this team member."); return; }
    if (members.some((member) => member.email.toLowerCase() === email)) { setFormError("That email is already on your team."); return; }
    try {
      workspace.addMember({ name: memberName, email, role: String(data.get("role")) as Member["role"] });
    } catch (error) {
      setFormError(error instanceof ZodError ? "Enter a valid email address, such as jordan@example.com." : error instanceof Error ? error.message : "This teammate couldn’t be added. Please try again.");
      return;
    }
    setModal(null);
    notify(`${memberName} added to the demo team.`);
  }

  const filteredTasks = tasks.filter((task) => {
    const member = members.find((person) => person.id === task.assigneeId);
    return (filter === "all" || task.status === filter) && (assignee === "all" || task.assigneeId === assignee) && `${task.title} ${task.category} ${member?.name ?? ""}`.toLowerCase().includes(query.toLowerCase());
  }).sort((a, b) => {
    if (sort === "name") return a.title.localeCompare(b.title);
    if (sort === "time") return a.dueTime.localeCompare(b.dueTime);
    const order = { overdue: 0, pending: 1, completed: 2 };
    return order[a.status] - order[b.status] || a.dueTime.localeCompare(b.dueTime);
  });
  const displayedTasks = view === "overview" ? filteredTasks.slice(0, 6) : filteredTasks;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`} aria-label="Main navigation">
        <button className="brand" onClick={() => navigate("overview")} aria-label="ShiftTrack overview"><span className="brand-mark"><ListChecks size={23} strokeWidth={2.2} /></span>ShiftTrack<span className="brand-period">.</span></button>
        <div className="workspace-switch"><span className="workspace-icon"><Building2 size={19} /></span><div><strong>{organization}</strong><span>Team workspace</span></div><span className="workspace-indicator" /></div>
        <div className="nav-label">WORKSPACE</div>
        <nav className="primary-nav">
          <button className={view === "overview" ? "nav-item active" : "nav-item"} onClick={() => navigate("overview")} aria-current={view === "overview" ? "page" : undefined}><LayoutDashboard size={19} />Overview</button>
          <button className={view === "tasks" ? "nav-item active" : "nav-item"} onClick={() => navigate("tasks")} aria-current={view === "tasks" ? "page" : undefined}><ClipboardList size={19} />Tasks<span className="nav-count">{tasks.length}</span></button>
          <button className={view === "team" ? "nav-item active" : "nav-item"} onClick={() => navigate("team")} aria-current={view === "team" ? "page" : undefined}><Users size={19} />Team</button>
          <button className="nav-item nav-disabled" disabled title="Reports are planned for a later milestone"><BarChart3 size={19} />Reports<span className="soon-badge">Soon</span></button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note"><div className="note-flower"><Flower2 size={26} strokeWidth={1.4} /></div><strong>Good shifts start here.</strong><p>A little organization.<br />A lot more peace of mind.</p><button onClick={() => openModal("help")}>Get to know ShiftTrack <ArrowUpRight size={14} /></button></div>
          <button className={view === "settings" ? "nav-item active" : "nav-item"} onClick={() => navigate("settings")}><Settings size={19} />Settings</button>
          <button className="nav-item" onClick={() => openModal("help")}><CircleHelp size={19} />Help & getting started</button>
          <div className="profile"><Avatar member={owner} /><div><strong>{name}</strong><span>Workspace owner</span></div><span className="profile-dot" /></div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb"><button className="mobile-menu icon-button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu size={22} /></button><span className="breadcrumb-workspace">Workspace</span><ChevronRight size={14} /><strong>{viewLabels[view]}</strong></div>
          <div className="topbar-actions"><span className="demo-pill"><span />Demo workspace</span><span className="topbar-divider" /><button className="notification-button icon-button" aria-label="View recent activity" onClick={() => openModal("activity")}><Bell size={19} /><span /></button><Avatar member={owner} small /></div>
        </header>

        <main id="main-content" className="main-content">
          {workspace.storageError && <div className="storage-notice" role="status">{workspace.storageError}</div>}
          <div className="page-heading"><div><div className="eyebrow"><span />YOUR TEAM, IN SYNC</div><h1>{view === "overview" ? <>Welcome back, {name.trim().split(/\s+/)[0]} <Sun className="greeting-sun" size={28} strokeWidth={1.5} /></> : view === "tasks" ? "A clear plan for every shift." : view === "team" ? "Good people. Great teamwork." : "Make yourself at home."}</h1><p>{view === "overview" ? "Here’s what’s happening with your team today." : view === "tasks" ? "The little things that keep your day running smoothly." : view === "team" ? "Keep your people connected and responsibilities clear." : "A few details that make this workspace yours."}</p></div><div className="heading-actions">{view === "overview" && <div className="date-label"><CalendarDays size={16} /><span>Sample shift · Sep 11</span></div>}{view !== "settings" && <Button onClick={() => openModal(view === "team" ? "member" : "task")}><Plus size={17} />{view === "team" ? "Add team member" : "Create task"}</Button>}</div></div>

          {(view === "overview" || view === "tasks") && <>
            <section className="stats-grid" aria-label="Task summary">
              {[
                { label: "Tasks assigned", value: stats.total, foot: "A shared plan for the day", icon: ClipboardList, tone: "neutral", filter: "all" as Filter },
                { label: "Completed", value: stats.completed, foot: "One task closer to a great shift", icon: CircleCheck, tone: "green", filter: "completed" as Filter },
                { label: "Pending", value: stats.pending, foot: "On your team’s to-do list", icon: Clock3, tone: "amber", filter: "pending" as Filter },
                { label: "Overdue", value: stats.overdue, foot: stats.overdue ? "A little attention needed" : "Everything is on track", icon: TriangleAlert, tone: "coral", filter: "overdue" as Filter },
              ].map(({ label, value, foot, icon: Icon, tone, filter: nextFilter }) => <button className={`stat-card stat-${tone} ${filter === nextFilter && filter !== "all" ? "stat-selected" : ""}`} key={label} onClick={() => setFilter(nextFilter)} aria-label={`Show ${label.toLowerCase()}: ${value}`}><div className="stat-top"><span>{label}</span><span className="stat-icon"><Icon size={18} strokeWidth={1.7} /></span></div><div className="stat-value">{value.toString().padStart(2, "0")}<span>{tone === "green" ? <CheckCheck size={20} /> : tone === "coral" && value > 0 ? <span className="attention-dot" /> : null}</span></div><p>{foot}</p></button>)}
            </section>

            {view === "overview" && <div className="shift-banner"><div className="banner-symbol"><Sparkles size={20} strokeWidth={1.5} /></div><div><strong>{stats.overdue ? "A small check-in can make a big difference." : "Looking good. Keep the momentum going."}</strong><p>{stats.overdue ? `${stats.overdue} ${stats.overdue === 1 ? "task needs" : "tasks need"} a little follow-up. Help your team finish the day on a high note.` : "Your team is making progress, one completed task at a time."}</p></div><button onClick={() => setFilter(stats.overdue ? "overdue" : "pending")}>{stats.overdue ? "Review overdue" : "See what’s next"}<ArrowRight size={16} /></button></div>}

            <div className={`dashboard-grid ${view === "tasks" ? "tasks-only" : ""}`}>
              <section className="panel tasks-panel" aria-labelledby="tasks-heading">
                <div className="panel-heading"><div><h2 id="tasks-heading">{view === "overview" ? "Today’s tasks" : "All tasks"}<span className="count-pill">{tasks.length}</span></h2><p>A little structure for a smoother day.</p></div><div className="sort-control"><ArrowDown size={14} /><select aria-label="Sort tasks" value={sort} onChange={(event) => setSort(event.target.value)}><option value="status">Priority first</option><option value="time">Due time</option><option value="name">Task name</option></select><ChevronDown size={12} /></div></div>
                <div className="task-tabs" aria-label="Filter by task status">{(["all", "pending", "completed", "overdue"] as Filter[]).map((item) => <button key={item} className={filter === item ? "task-tab selected" : "task-tab"} onClick={() => setFilter(item)} aria-pressed={filter === item}>{item === "all" ? "All tasks" : item.charAt(0).toUpperCase() + item.slice(1)}<span>{item === "all" ? tasks.length : stats[item]}</span></button>)}</div>
                <div className="table-toolbar"><div className="task-search"><Search size={16} /><input aria-label="Search tasks" placeholder="Search tasks…" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button aria-label="Clear search" onClick={() => setQuery("")}><X size={14} /></button>}</div><div className="assignee-filter"><SlidersHorizontal size={14} /><select value={assignee} aria-label="Filter by team member" onChange={(event) => setAssignee(event.target.value)}><option value="all">All members</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select><ChevronDown size={12} /></div></div>
                <div className="task-table-wrap"><table className="task-table"><thead><tr><th scope="col" className="task-name-heading">Task name</th><th scope="col">Assigned to</th><th scope="col">Due time</th><th scope="col">Status</th></tr></thead><tbody>{displayedTasks.map((task) => {
                  const member = members.find((person) => person.id === task.assigneeId);
                  return <tr key={task.id}><td><div className="task-name-cell"><button className={`task-check ${task.status === "completed" ? "checked" : ""}`} aria-label={task.status === "completed" ? `${task.title} is completed` : `Complete ${task.title}`} disabled={task.status === "completed"} onClick={() => complete(task)}>{task.status === "completed" && <Check size={12} strokeWidth={2.7} />}</button><button className="task-title" onClick={() => setSelectedTaskId(task.id)}><strong>{task.title}</strong><span><span className={`category-dot category-${task.category.toLowerCase()}`} />{task.category}<span className="task-meta-separator">·</span><Repeat2 size={10} />{task.frequency === "once" ? "One-time" : task.frequency === "daily" ? "Daily" : "Weekly"}</span></button></div></td><td><span className="table-member"><Avatar member={member} small /><span>{member?.name.split(" ")[0] ?? "Unassigned"}</span></span></td><td><span className={task.status === "overdue" ? "due-time overdue-time" : "due-time"}>{task.status === "overdue" && <Clock3 size={12} />}{formatTime(task.dueTime)}</span></td><td><StatusBadge status={task.status} /></td></tr>;
                })}</tbody></table>{displayedTasks.length === 0 && <div className="empty-state"><Search size={27} /><h3>No tasks here just yet</h3><p>{query || filter !== "all" || assignee !== "all" ? "Try another search or clear your filters." : "Create a task to give your team a place to start."}</p><Button variant="outline" size="sm" onClick={() => { setQuery(""); setFilter("all"); setAssignee("all"); }}>Clear filters</Button></div>}</div>
                <div className="table-footer"><span>Showing {displayedTasks.length} of {filteredTasks.length} tasks</span>{view === "overview" ? <button onClick={() => { setView("tasks"); }}>View all tasks<ArrowRight size={14} /></button> : <span className="local-note"><span />{workspace.storageError ? "Available this session" : "Saved on this device"}</span>}</div>
              </section>

              {view === "overview" && <aside className="insights-column" aria-label="Team progress and activity"><section className="panel progress-panel"><div className="panel-heading"><h2>Every task counts</h2><span className="today-tag">Today</span></div><div className="progress-visual"><svg viewBox="0 0 160 160" role="img" aria-label={`${stats.completionRate}% of tasks completed`}><circle className="progress-track" cx="80" cy="80" r="64" /><circle className="progress-arc" cx="80" cy="80" r="64" strokeDasharray={`${stats.completionRate * 4.0212} 402.12`} /></svg><div className="progress-text"><strong>{stats.completionRate}<span>%</span></strong><span>completed</span></div><span className="progress-sparkle"><Sparkles size={17} /></span></div><p className="progress-caption"><strong>{stats.completed} of {stats.total} tasks</strong> checked off. Keep it up!</p><div className="progress-legend"><span><i className="legend-completed" />Completed<b>{stats.completed}</b></span><span><i className="legend-pending" />Remaining<b>{stats.pending + stats.overdue}</b></span></div></section>
                <section className="panel activity-panel"><div className="panel-heading"><h2>Recent activity</h2><span className="live-dot" /></div><div className="activity-list">{activity.slice(0, 3).map((item) => { const member = members.find((person) => person.id === item.memberId); return <div className="activity-item" key={item.id}><span className={`activity-symbol ${item.type === "created" ? "activity-created" : ""}`}>{item.type === "completed" ? <Check size={13} /> : <Plus size={13} />}</span><div><p><strong>{member?.name.split(" ")[0] ?? "You"}</strong> {item.type === "completed" ? "completed a task" : "created a task"}</p><span>{item.taskTitle}</span><time>{formatTime(item.time)}</time></div></div>; })}</div><button className="activity-more" onClick={() => openModal("activity")}>See all activity<ArrowRight size={14} /></button></section>
              </aside>}
            </div>
          </>}

          {view === "team" && <section className="panel team-panel"><div className="panel-heading"><div><h2>Your team<span className="count-pill">{members.length}</span></h2><p>Everyone has a part in a well-run shift.</p></div><span className="today-tag">Demo members</span></div><div className="member-grid">{members.map((member) => { const assigned = tasks.filter((task) => task.assigneeId === member.id); return <article className="member-card" key={member.id}><div className="member-card-top"><Avatar member={member} /><span className={`role-badge role-${member.role}`}>{member.role}</span></div><h3>{member.name}</h3><p>{member.email}</p><div className="member-card-stats"><span><strong>{assigned.length}</strong> assigned</span><span><CircleCheck size={14} /><strong>{assigned.filter((task) => task.status === "completed").length}</strong> completed</span></div><button onClick={() => { navigate("tasks"); setAssignee(member.id); }}>View tasks<ArrowUpRight size={15} /></button></article>; })}<button className="add-member-card" onClick={() => openModal("member")}><span><Plus size={23} /></span><strong>A place for your next teammate</strong><p>Add someone to the demo team</p></button></div><div className="team-note"><Users size={16} />Demo members are saved locally. Account invitations come with the authentication milestone.</div></section>}

          {view === "settings" && <section className="panel settings-panel"><div className="panel-heading"><div><h2>Workspace details</h2><p>The basics, all in one place.</p></div><Building2 size={23} /></div><form key={`${name}-${organization}`} className="settings-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const nextName = String(data.get("name")).trim(); const nextOrganization = String(data.get("organization")).trim(); if (!nextName || !nextOrganization) { notify("Enter a name and organization to save your changes."); return; } workspace.updateSettings({ name: nextName, organization: nextOrganization }); notify("Workspace details saved."); }}><label>Your full name<Input name="name" required maxLength={80} defaultValue={name} autoComplete="name" /></label><label>Organization name<Input name="organization" required maxLength={100} defaultValue={organization} autoComplete="organization" /></label><div className="settings-save"><span>{workspace.storageError ? "Changes are available for this session." : "Changes are saved on this device."}</span><Button type="submit">Save changes<Check size={16} /></Button></div></form><div className="demo-settings"><div><h3>A fresh start</h3><p>Restore the sample tasks, team, and workspace details.</p></div><Button variant="outline" onClick={() => openModal("reset")}>Reset demo</Button></div></section>}

          <footer className="page-footer"><span><span className="footer-brand-mark"><ListChecks size={14} /></span>A little clarity. A smoother shift.</span><span>Made for the people who keep things moving.<span className="footer-flower">✳</span></span></footer>
        </main>
      </div>

      <Dialog open={modal !== null} onOpenChange={(open) => { if (!open) setModal(null); }}>
        <DialogContent className={modal === "activity" ? "activity-dialog" : ""}>
          {modal === "task" && <><DialogHeader><span className="modal-icon"><ClipboardList size={23} /></span><DialogTitle>A new task, a clearer shift.</DialogTitle><DialogDescription>Give your team a clear next step. This task is added to the sample shift.</DialogDescription></DialogHeader><form className="modal-form" onSubmit={createTask}><label>Task name<Input name="title" placeholder="e.g. Complete the evening safety check" required maxLength={120} autoFocus /></label><label>Description <span className="optional">optional</span><Textarea name="description" placeholder="What does your teammate need to know?" maxLength={800} rows={3} /></label><div className="form-row"><label>Category<select name="category" defaultValue="Operations">{categories.map((category) => <option key={category}>{category}</option>)}</select></label><label>Assign to<select name="assignee" defaultValue={members.find((member) => member.role === "employee")?.id ?? members[0]?.id}>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label></div><div className="form-row"><label>Frequency<select name="frequency" defaultValue="daily"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="once">One-time</option></select></label><label>Due time<Input name="dueTime" type="time" required defaultValue="17:00" /></label></div><p className="form-hint"><Repeat2 size={13} />Frequency is saved for preview. Automatic repeats come later.</p>{formError && <p className="form-error" role="alert">{formError}</p>}<DialogFooter><Button variant="outline" type="button" onClick={() => setModal(null)}>Cancel</Button><Button type="submit"><Plus size={16} />Create task</Button></DialogFooter></form></>}
          {modal === "member" && <><DialogHeader><span className="modal-icon"><Users size={23} /></span><DialogTitle>Make room for a teammate.</DialogTitle><DialogDescription>Add a member to this local demo. No email invitation will be sent.</DialogDescription></DialogHeader><form className="modal-form" onSubmit={addMember}><label>Full name<Input name="name" placeholder="Jordan Taylor" required maxLength={80} autoFocus autoComplete="name" /></label><label>Email address<Input name="email" type="email" placeholder="jordan@example.com" required maxLength={120} autoComplete="email" /></label><label>Role<select name="role" defaultValue="employee"><option value="employee">Employee — completes assigned tasks</option><option value="manager">Manager — creates and assigns tasks</option></select></label>{formError && <p className="form-error" role="alert">{formError}</p>}<DialogFooter><Button variant="outline" type="button" onClick={() => setModal(null)}>Cancel</Button><Button type="submit"><Plus size={16} />Add team member</Button></DialogFooter></form></>}
          {modal === "activity" && <><DialogHeader><DialogTitle>The little wins add up.</DialogTitle><DialogDescription>Your team’s latest updates in this sample shift.</DialogDescription></DialogHeader><div className="full-activity-list">{activity.map((item) => { const member = members.find((person) => person.id === item.memberId); return <div className="full-activity-item" key={item.id}><Avatar member={member} small /><div><p><strong>{member?.name ?? "You"}</strong> {item.type === "completed" ? "completed" : "created"}</p><span>{item.taskTitle}</span></div><time>{formatTime(item.time)}</time></div>; })}</div></>}
          {modal === "help" && <><DialogHeader><span className="modal-icon"><Flower2 size={25} /></span><DialogTitle>A smoother shift starts here.</DialogTitle><DialogDescription>Welcome to your first ShiftTrack workspace.</DialogDescription></DialogHeader><div className="getting-started"><div><span>01</span><div><h3>Give every task a home</h3><p>Create a task, choose a teammate, and set a due time.</p></div></div><div><span>02</span><div><h3>Make progress together</h3><p>Click the circle beside a task to complete it. Your totals and activity update instantly.</p></div></div><div><span>03</span><div><h3>See the day at a glance</h3><p>Filter tasks by status or teammate to see what needs attention.</p></div></div></div><div className="help-note"><ShieldCheck size={19} /><p>This is a local demo with sample data. Your changes stay in this browser. Authentication, shared workspaces, and recurring schedules are next.</p></div><DialogFooter><Button onClick={() => setModal(null)}>Let’s get started<ArrowRight size={16} /></Button></DialogFooter></>}
          {modal === "reset" && <><DialogHeader><DialogTitle>Start fresh?</DialogTitle><DialogDescription>This will replace your demo changes with the original sample tasks, team, and workspace details.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setModal(null)}>Keep my changes</Button><Button onClick={() => { workspace.resetDemo(); setModal(null); navigate("overview"); notify("Your demo is back to a fresh start."); }}>Reset demo</Button></DialogFooter></>}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedTask} onOpenChange={(open) => { if (!open) setSelectedTaskId(null); }}><DialogContent>{selectedTask && <><DialogHeader><span className="modal-icon"><ClipboardList size={23} /></span><DialogTitle>{selectedTask.title}</DialogTitle><DialogDescription>Everything your teammate needs for this task.</DialogDescription></DialogHeader><div className="task-details"><StatusBadge status={selectedTask.status} /><p>{selectedTask.description || "No additional details for this task."}</p><dl><div><dt>Assigned to</dt><dd>{members.find((member) => member.id === selectedTask.assigneeId)?.name}</dd></div><div><dt>Due time</dt><dd>{formatTime(selectedTask.dueTime)}</dd></div><div><dt>Frequency</dt><dd>{selectedTask.frequency === "once" ? "One-time" : selectedTask.frequency}</dd></div><div><dt>Category</dt><dd>{selectedTask.category}</dd></div>{selectedTask.completedAt && <div><dt>Completed at</dt><dd>{formatTime(selectedTask.completedAt)}</dd></div>}</dl></div><DialogFooter><Button variant="outline" onClick={() => setSelectedTaskId(null)}>Close</Button>{selectedTask.status !== "completed" && <Button onClick={() => { complete(selectedTask); setSelectedTaskId(null); }}><Check size={16} />Mark complete</Button>}</DialogFooter></>}</DialogContent></Dialog>
      {notification && <div className="toast" role="status"><span><Check size={15} /></span>{notification}<button aria-label="Dismiss notification" onClick={() => setNotification("")}><X size={15} /></button></div>}
    </div>
  );
}
