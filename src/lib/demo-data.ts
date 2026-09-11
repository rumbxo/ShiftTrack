export type MemberRole = "owner" | "manager" | "employee";

export type Member = {
  id: string;
  name: string;
  initials: string;
  role: MemberRole;
  color: string;
  email: string;
};

export type TaskFrequency = "daily" | "weekly" | "once";
export type TaskStatus = "pending" | "completed" | "overdue";
export type TaskCategory =
  | "Safety"
  | "Operations"
  | "Documentation"
  | "Maintenance"
  | "Team";

export type Task = {
  id: string;
  title: string;
  description: string;
  category: TaskCategory;
  assigneeId: string;
  /** Local demo time, in zero-padded 24-hour HH:mm format. */
  dueTime: string;
  frequency: TaskFrequency;
  status: TaskStatus;
  /** Local demo completion time, in HH:mm format. */
  completedAt?: string;
};

export type Activity = {
  id: string;
  taskTitle: string;
  memberId: string;
  type: "completed" | "created";
  /** Local demo time, in HH:mm format. */
  time: string;
};

export type TaskStats = {
  total: number;
  completed: number;
  pending: number;
  overdue: number;
  completionRate: number;
};

export const demoMembers: Member[] = [
  {
    id: "member-ahmand",
    name: "Ahmand Edmonds",
    initials: "AE",
    role: "owner",
    color: "#7662D3",
    email: "ahmand@example.com",
  },
  {
    id: "member-marcus",
    name: "Marcus Johnson",
    initials: "MJ",
    role: "manager",
    color: "#4C82AC",
    email: "marcus@example.com",
  },
  {
    id: "member-sarah",
    name: "Sarah Wilson",
    initials: "SW",
    role: "employee",
    color: "#D49A50",
    email: "sarah@example.com",
  },
  {
    id: "member-daniel",
    name: "Daniel Kim",
    initials: "DK",
    role: "employee",
    color: "#618D76",
    email: "daniel@example.com",
  },
  {
    id: "member-emma",
    name: "Emma Davis",
    initials: "ED",
    role: "employee",
    color: "#BC7B91",
    email: "emma@example.com",
  },
];

// This is a fixed sample shift. No client, patient, or other sensitive records
// are used, and the sample status does not depend on the device's current clock.
const taskSeed: readonly Task[] = [
  {
    id: "task-vehicle-check",
    title: "Complete vehicle safety check",
    description:
      "Check tires, lights, fuel level, and the first-aid kit. Record any maintenance needs before the next trip.",
    category: "Safety",
    assigneeId: "member-daniel",
    dueTime: "10:00",
    frequency: "daily",
    status: "overdue",
  },
  {
    id: "task-documentation",
    title: "Review daily shift documentation",
    description:
      "Confirm the operational shift checklist is complete and flag any missing facility or equipment updates.",
    category: "Documentation",
    assigneeId: "member-sarah",
    dueTime: "11:00",
    frequency: "daily",
    status: "pending",
  },
  {
    id: "task-supplies",
    title: "Restock shared supply stations",
    description:
      "Check the supply inventory, restock cleaning materials, and add low-stock items to the next order.",
    category: "Operations",
    assigneeId: "member-emma",
    dueTime: "12:00",
    frequency: "daily",
    status: "pending",
  },
  {
    id: "task-handoff",
    title: "Prepare afternoon shift handoff",
    description:
      "Summarize open operational tasks, equipment issues, and staffing updates for the incoming team.",
    category: "Team",
    assigneeId: "member-marcus",
    dueTime: "14:00",
    frequency: "daily",
    status: "pending",
  },
  {
    id: "task-safety-walk",
    title: "Complete morning safety walkthrough",
    description:
      "Walk through shared areas and confirm exits are clear, floors are dry, and safety equipment is accessible.",
    category: "Safety",
    assigneeId: "member-sarah",
    dueTime: "08:00",
    frequency: "daily",
    status: "completed",
    completedAt: "07:52",
  },
  {
    id: "task-opening",
    title: "Finish opening checklist",
    description:
      "Open shared work areas, check the notice board, and verify that the team has the supplies needed for the shift.",
    category: "Operations",
    assigneeId: "member-emma",
    dueTime: "08:00",
    frequency: "daily",
    status: "completed",
    completedAt: "07:58",
  },
  {
    id: "task-coverage",
    title: "Confirm today’s shift coverage",
    description:
      "Review the staff rota and confirm coverage for breaks, shared duties, and the afternoon handoff.",
    category: "Team",
    assigneeId: "member-marcus",
    dueTime: "08:15",
    frequency: "daily",
    status: "completed",
    completedAt: "08:10",
  },
  {
    id: "task-equipment",
    title: "Check shared equipment",
    description:
      "Inspect the radios, chargers, and shared workstations. Report equipment that needs repair or replacement.",
    category: "Maintenance",
    assigneeId: "member-daniel",
    dueTime: "08:30",
    frequency: "daily",
    status: "completed",
    completedAt: "08:24",
  },
  {
    id: "task-cleaning",
    title: "Update the cleaning checklist",
    description:
      "Confirm common-area cleaning is complete and record any follow-up work for the facilities team.",
    category: "Documentation",
    assigneeId: "member-emma",
    dueTime: "09:00",
    frequency: "daily",
    status: "completed",
    completedAt: "08:42",
  },
  {
    id: "task-emergency-kit",
    title: "Inspect emergency supply kits",
    description:
      "Check that emergency kits are present, clearly labeled, and stocked according to the facility checklist.",
    category: "Safety",
    assigneeId: "member-daniel",
    dueTime: "09:00",
    frequency: "weekly",
    status: "completed",
    completedAt: "08:55",
  },
  {
    id: "task-notice-board",
    title: "Refresh the team notice board",
    description:
      "Post the current shift schedule, remove outdated notices, and share this week’s operational reminders.",
    category: "Team",
    assigneeId: "member-marcus",
    dueTime: "09:30",
    frequency: "weekly",
    status: "completed",
    completedAt: "09:18",
  },
  {
    id: "task-maintenance-log",
    title: "Review the maintenance log",
    description:
      "Review open maintenance items and confirm the next action and responsible team member for each issue.",
    category: "Maintenance",
    assigneeId: "member-sarah",
    dueTime: "10:00",
    frequency: "daily",
    status: "completed",
    completedAt: "09:46",
  },
];

/** Each call returns independent task objects so demo edits cannot alter the seed. */
export function createDemoTasks(): Task[] {
  return taskSeed.map((task) => ({ ...task }));
}

export const demoActivity: Activity[] = [
  {
    id: "activity-maintenance-log",
    taskTitle: "Review the maintenance log",
    memberId: "member-sarah",
    type: "completed",
    time: "09:46",
  },
  {
    id: "activity-notice-board",
    taskTitle: "Refresh the team notice board",
    memberId: "member-marcus",
    type: "completed",
    time: "09:18",
  },
  {
    id: "activity-emergency-kit",
    taskTitle: "Inspect emergency supply kits",
    memberId: "member-daniel",
    type: "completed",
    time: "08:55",
  },
  {
    id: "activity-cleaning",
    taskTitle: "Update the cleaning checklist",
    memberId: "member-emma",
    type: "completed",
    time: "08:42",
  },
];

/** Pending and overdue are separate counts; an empty list has 0% completion. */
export function getTaskStats(tasks: readonly Task[]): TaskStats {
  const completed = tasks.filter((task) => task.status === "completed").length;

  return {
    total: tasks.length,
    completed,
    pending: tasks.filter((task) => task.status === "pending").length,
    overdue: tasks.filter((task) => task.status === "overdue").length,
    completionRate: tasks.length ? Math.round((completed / tasks.length) * 100) : 0,
  };
}

/** Formats HH:mm without date parsing, timezone conversion, or locale differences. */
export function formatTime(time: string): string {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return time || "—";

  const [hours, minutes] = time.split(":");
  const hour = Number(hours);

  return `${hour % 12 || 12}:${minutes} ${hour >= 12 ? "PM" : "AM"}`;
}

/** Uses the first and last words; a single-word name gets one initial. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";

  const first = Array.from(words[0])[0] ?? "";
  const last = words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? "") : "";

  return `${first}${last}`.toUpperCase();
}
