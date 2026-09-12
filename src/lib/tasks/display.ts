import type { Task } from "@/lib/tasks/types";

export type TaskStatus = "pending" | "completed" | "overdue";
export const frequencyLabels = { once: "One-time", daily: "Daily", weekly: "Weekly", monthly: "Monthly" };

export function taskStatus(task: Task, now: number): TaskStatus {
  return task.completedAt ? "completed" : Date.parse(task.dueAt) < now ? "overdue" : "pending";
}

export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((Array.from(words[0] ?? "")[0] ?? "") + (words.length > 1 ? Array.from(words.at(-1) ?? "")[0] ?? "" : "")).toUpperCase();
}

export function dateLabel(value: string, local: boolean) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
    ...(local ? {} : { timeZone: "UTC", timeZoneName: "short" as const }),
  }).format(new Date(value));
}

export function localDateInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
