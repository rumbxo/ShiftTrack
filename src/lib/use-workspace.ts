"use client";

import { useMemo, useSyncExternalStore } from "react";
import { z } from "zod";
import {
  createDemoTasks,
  demoActivity,
  demoMembers,
  initials,
  type Activity,
  type Member,
  type Task,
} from "@/lib/demo-data";

const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const idSchema = z.string().min(1).max(100);
const memberInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  role: z.enum(["owner", "manager", "employee"]),
});
const memberSchema = memberInputSchema.extend({
  id: idSchema,
  initials: z.string().min(1).max(10),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
const taskInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000),
  category: z.enum([
    "Safety",
    "Operations",
    "Documentation",
    "Maintenance",
    "Team",
  ]),
  assigneeId: idSchema,
  dueTime: localTimeSchema,
  frequency: z.enum(["daily", "weekly", "once"]),
});
const taskSchema = taskInputSchema.extend({
  id: idSchema,
  status: z.enum(["pending", "completed", "overdue"]),
  completedAt: localTimeSchema.optional(),
});
const activitySchema = z.object({
  id: idSchema,
  taskTitle: z.string().min(1).max(160),
  memberId: idSchema,
  type: z.enum(["completed", "created"]),
  time: localTimeSchema,
});
const settingsSchema = z.object({
  organization: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(100),
});
const workspaceSchema = settingsSchema
  .extend({
    tasks: z.array(taskSchema),
    members: z.array(memberSchema).min(1),
    activity: z.array(activitySchema),
  })
  .refine((workspace) => {
    const memberIds = new Set(workspace.members.map((member) => member.id));
    const taskIds = new Set(workspace.tasks.map((task) => task.id));
    const activityIds = new Set(workspace.activity.map((entry) => entry.id));

    return (
      memberIds.size === workspace.members.length &&
      taskIds.size === workspace.tasks.length &&
      activityIds.size === workspace.activity.length &&
      workspace.tasks.every((task) => memberIds.has(task.assigneeId)) &&
      workspace.activity.every((entry) => memberIds.has(entry.memberId))
    );
  }, "The saved demo contains invalid member or task references.");

export type WorkspaceUser = {
  id: string;
  name: string;
  email: string;
};

type WorkspaceData = {
  tasks: Task[];
  members: Member[];
  activity: Activity[];
  organization: string;
  name: string;
};

type WorkspaceSnapshot = WorkspaceData & {
  ready: boolean;
  storageError: string | null;
};

function createDemoWorkspace(user: WorkspaceUser): WorkspaceData {
  return {
    tasks: createDemoTasks(),
    members: demoMembers.map((member, index) =>
      index === 0
        ? {
            ...member,
            name: user.name,
            initials: initials(user.name),
            email: user.email,
          }
        : { ...member },
    ),
    activity: demoActivity.map((entry) => ({ ...entry })),
    organization: "Oak Street Group Home",
    name: user.name,
  };
}

// Each mounted workspace owns its state. Neither server renders nor different
// signed-in accounts share a mutable snapshot or a browser storage namespace.
function createWorkspaceStore(user: WorkspaceUser) {
  const storageKey = `shifttrack-demo-v1:${user.id}`;
  // Server rendering and the first hydration render share deterministic demo data.
  // Browser storage is read only after React subscribes on the client.
  const serverSnapshot: WorkspaceSnapshot = {
    ...createDemoWorkspace(user),
    ready: false,
    storageError: null,
  };
  let snapshot = serverSnapshot;
  const listeners = new Set<() => void>();

  function emitChange() {
    listeners.forEach((listener) => listener());
  }

  function loadSavedWorkspace(raw: string | null): WorkspaceSnapshot {
    if (raw === null) {
      return { ...createDemoWorkspace(user), ready: true, storageError: null };
    }

    try {
      const data = workspaceSchema.parse(JSON.parse(raw));
      return { ...data, ready: true, storageError: null };
    } catch {
      return {
        ...createDemoWorkspace(user),
        ready: true,
        storageError:
          "The saved demo could not be loaded. Sample data has been restored.",
      };
    }
  }

  function initialize() {
    if (snapshot.ready || typeof window === "undefined") return;

    try {
      snapshot = loadSavedWorkspace(window.localStorage.getItem(storageKey));
    } catch {
      snapshot = {
        ...createDemoWorkspace(user),
        ready: true,
        storageError:
          "Browser storage is unavailable. Your changes will last for this session.",
      };
    }

    emitChange();
  }

  function handleStorage(event: StorageEvent) {
    if (event.key !== storageKey && event.key !== null) return;

    // Only localStorage changes belong to this store; ignore sessionStorage.
    try {
      if (event.storageArea !== window.localStorage) return;
    } catch {
      return;
    }

    snapshot = loadSavedWorkspace(event.key === null ? null : event.newValue);
    emitChange();
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);

    if (listeners.size === 1) window.addEventListener("storage", handleStorage);
    initialize();

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        window.removeEventListener("storage", handleStorage);
      }
    };
  }

  function getSnapshot() {
    return snapshot;
  }

  function getServerSnapshot() {
    return serverSnapshot;
  }

  function saveWorkspace(data: WorkspaceData) {
    let storageError: string | null = null;

    try {
      // Persist only workspace data; readiness and storage errors are session state.
      const { tasks, members, activity, organization, name } = data;
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ tasks, members, activity, organization, name }),
      );
    } catch {
      storageError =
        "Your changes are available for this session, but could not be saved in this browser.";
    }

    snapshot = { ...data, ready: true, storageError };
    emitChange();
  }

  function currentLocalTime() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  }

  function addTask(input: Omit<Task, "id" | "status" | "completedAt">) {
    initialize();
    const taskInput = taskInputSchema.parse(input);

    if (!snapshot.members.some((member) => member.id === taskInput.assigneeId)) {
      throw new Error("Choose a team member from this workspace.");
    }

    const task: Task = {
      ...taskInput,
      id: crypto.randomUUID(),
      // Recurrence and overdue scheduling are preview settings in this local demo.
      status: "pending",
    };
    const creator =
      snapshot.members.find((member) => member.role === "owner") ??
      snapshot.members[0];
    const entry: Activity = {
      id: crypto.randomUUID(),
      taskTitle: task.title,
      memberId: creator.id,
      type: "created",
      time: currentLocalTime(),
    };

    saveWorkspace({
      ...snapshot,
      tasks: [task, ...snapshot.tasks],
      activity: [entry, ...snapshot.activity],
    });
    return task;
  }

  function completeTask(taskId: string) {
    initialize();
    const task = snapshot.tasks.find((entry) => entry.id === taskId);
    if (!task || task.status === "completed") return;

    const time = currentLocalTime();
    const entry: Activity = {
      id: crypto.randomUUID(),
      taskTitle: task.title,
      memberId: task.assigneeId,
      type: "completed",
      time,
    };

    saveWorkspace({
      ...snapshot,
      tasks: snapshot.tasks.map((entry) =>
        entry.id === taskId
          ? { ...entry, status: "completed", completedAt: time }
          : entry,
      ),
      activity: [entry, ...snapshot.activity],
    });
  }

  function addMember(input: Omit<Member, "id" | "initials" | "color">) {
    initialize();
    const memberInput = memberInputSchema.parse(input);

    if (
      snapshot.members.some(
        (member) => member.email.toLowerCase() === memberInput.email.toLowerCase(),
      )
    ) {
      throw new Error("A team member with this email already exists.");
    }

    const member: Member = {
      ...memberInput,
      id: crypto.randomUUID(),
      initials: initials(memberInput.name),
      color: demoMembers[snapshot.members.length % demoMembers.length].color,
    };

    saveWorkspace({ ...snapshot, members: [...snapshot.members, member] });
    return member;
  }

  function updateSettings(input: { organization: string; name: string }) {
    initialize();
    const settings = settingsSchema.parse(input);
    const owner = snapshot.members.find((member) => member.role === "owner");

    saveWorkspace({
      ...snapshot,
      ...settings,
      members: snapshot.members.map((member) =>
        member.id === owner?.id
          ? { ...member, name: settings.name, initials: initials(settings.name) }
          : member,
      ),
    });
  }

  function resetDemo() {
    saveWorkspace(createDemoWorkspace(user));
  }

  return {
    subscribe,
    getSnapshot,
    getServerSnapshot,
    addTask,
    completeTask,
    addMember,
    updateSettings,
    resetDemo,
  };
}

export function useWorkspace({ id, name, email }: WorkspaceUser) {
  const store = useMemo(
    () => createWorkspaceStore({ id, name, email }),
    [id, name, email],
  );
  const workspace = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );

  return {
    ...workspace,
    addTask: store.addTask,
    completeTask: store.completeTask,
    addMember: store.addMember,
    updateSettings: store.updateSettings,
    resetDemo: store.resetDemo,
  };
}
