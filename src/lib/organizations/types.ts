export type OrganizationRole = "owner" | "manager" | "employee";
export type AssignableOrganizationRole = Exclude<OrganizationRole, "owner">;

export type Organization = {
  id: string;
  name: string;
  role: OrganizationRole;
  membershipId: string;
};

export type OrganizationMember = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: OrganizationRole;
  createdAt: string;
};

export const organizationRoleLabels: Record<OrganizationRole, string> = {
  owner: "Owner",
  manager: "Manager",
  employee: "Employee",
};
