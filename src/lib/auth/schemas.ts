import { z } from "zod";

const email = z
  .string()
  .trim()
  .email("Enter a valid email address.")
  .max(254, "Enter an email address with 254 characters or fewer.");

const password = z
  .string()
  .min(8, "Use a password with at least 8 characters.")
  .max(128, "Use a password with 128 characters or fewer.");

export const loginSchema = z.object({
  email,
  // Existing accounts may predate the application's new-password policy.
  password: z.string().min(1, "Enter your password.").max(128, "Your password is too long."),
  next: z.string().max(1024).optional(),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(80, "Use a name with 80 characters or fewer."),
  email,
  password,
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({ password, confirmPassword: z.string() })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Your passwords do not match.",
    path: ["confirmPassword"],
  });
