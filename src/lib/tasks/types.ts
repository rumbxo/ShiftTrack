import type { Organization, OrganizationMember } from "@/lib/organizations/types";

export const taskCategories = ["Safety", "Operations", "Documentation", "Maintenance", "Team"] as const;
export const taskFrequencies = ["once", "daily", "weekly", "monthly"] as const;
export type TaskCategory = (typeof taskCategories)[number];
export type TaskFrequency = (typeof taskFrequencies)[number];

export type TaskInput = {
  title: string;
  description: string;
  category: TaskCategory;
  /** An existing organization membership, or an unassigned task. */
  assigneeId: string | null;
  dueAt: string;
  frequency: TaskFrequency;
  timeZone: string;
};

export type Task = TaskInput & {
  id: string;
  completedAt: string | null;
  createdAt: string;
  /** Auth user IDs; assignments use membership IDs instead. */
  createdBy: string | null;
  completedBy: string | null;
  parentTaskId: string | null;
};

export type TaskSnapshot = {
  userId: string;
  organization: Organization;
  tasks: Task[];
  members: OrganizationMember[];
  fetchedAt: string;
};
