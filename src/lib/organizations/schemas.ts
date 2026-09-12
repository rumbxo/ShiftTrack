import { z } from "zod";

export const organizationNameSchema = z.object({
  name: z.string().trim().min(1, "Enter an organization name.").max(120, "Use an organization name with 120 characters or fewer."),
});

const assignableRole = z.enum(["manager", "employee"], {
  error: "Choose Manager or Employee. The owner role cannot be assigned here.",
});
const membershipId = z.string().uuid("Choose a valid organization member.");

export const addOrganizationMemberSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.").max(254, "Enter an email address with 254 characters or fewer."),
  role: assignableRole,
});

export const setOrganizationMemberRoleSchema = z.object({
  membershipId,
  role: assignableRole,
});

export const removeOrganizationMemberSchema = z.object({ membershipId });
