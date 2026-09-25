import "server-only";
import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";
import {
  findUserByEmail,
  findUserById,
  findManyUsers,
  countUsers,
  createUser,
  updateUser,
  deleteUser,
} from "@/lib/repositories/user.repository";
import type { Role } from "@/lib/permissions";
import { logAuditEvent } from "@/lib/services/audit.service";
import { prisma } from "@/lib/db";

const BCRYPT_ROUNDS = 10;

/** Brute-force brake: after this many failed logins for one email within the window, every attempt fails until it passes. */
const MAX_FAILED_LOGINS = 10;
const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;

function countRecentFailedLogins(email: string): Promise<number> {
  return prisma.auditLog.count({
    where: {
      eventType: "LOGIN_FAILED",
      message: email,
      createdAt: { gte: new Date(Date.now() - FAILED_LOGIN_WINDOW_MS) },
    },
  });
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * The panel's real authentication check (Fase 15): looks up the user by
 * email, requires active=true, and compares the password against the
 * stored bcrypt hash. Returns null on any failure — never distinguishes
 * "wrong password" from "no such user" to the caller, so the login form
 * can't be used to enumerate accounts.
 */
export async function verifyLogin(email: string, password: string): Promise<User | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if ((await countRecentFailedLogins(normalizedEmail)) >= MAX_FAILED_LOGINS) return null;

  const user = await findUserByEmail(normalizedEmail);
  const valid = user?.active ? await bcrypt.compare(password, user.passwordHash ?? "") : false;
  if (!user || !valid) {
    // Stored with no companyId so it never shows up in the panel's activity feed.
    await logAuditEvent({ eventType: "LOGIN_FAILED", status: "warning", message: normalizedEmail });
    return null;
  }
  return user;
}

export function listUsers(companyId: string): Promise<User[]> {
  return findManyUsers(companyId);
}

export function getUser(id: string): Promise<User | null> {
  return findUserById(id);
}

export interface CreateUserFromInput {
  companyId: string;
  name: string;
  email: string;
  password: string;
  role: Role;
  active: boolean;
}

export async function createUserFromInput(input: CreateUserFromInput): Promise<User> {
  const passwordHash = await hashPassword(input.password);
  const user = await createUser({
    companyId: input.companyId,
    name: input.name,
    email: input.email,
    passwordHash,
    role: input.role,
    active: input.active,
  });
  await logAuditEvent({
    companyId: input.companyId,
    eventType: "USER_CREATED",
    status: "ok",
    message: `Usuario creado: ${user.email} (${user.role}).`,
  });
  return user;
}

export interface UpdateUserFromInput {
  name?: string;
  email?: string;
  role?: Role;
  active?: boolean;
}

/**
 * True when `id` is the only active ADMIN of its company — demoting or
 * deactivating it would leave nobody able to manage /usuarios.
 */
export async function isLastActiveAdmin(id: string): Promise<boolean> {
  const user = await findUserById(id);
  if (!user || user.role !== "ADMIN" || !user.active) return false;
  const otherAdmins = await prisma.user.count({
    where: { companyId: user.companyId, role: "ADMIN", active: true, id: { not: id } },
  });
  return otherAdmins === 0;
}

export async function updateUserFromInput(id: string, input: UpdateUserFromInput): Promise<User> {
  const user = await updateUser(id, input);
  await logAuditEvent({
    eventType: "USER_UPDATED",
    status: "ok",
    message: `Usuario actualizado: ${user.email}.`,
    metadata: { ...input },
  });
  return user;
}

export async function resetUserPassword(id: string, newPassword: string): Promise<User> {
  const passwordHash = await hashPassword(newPassword);
  const user = await updateUser(id, { passwordHash });
  await logAuditEvent({
    eventType: "USER_PASSWORD_RESET",
    status: "ok",
    message: `Contraseña restablecida para ${user.email}.`,
  });
  return user;
}

export async function setUserActive(id: string, active: boolean): Promise<User> {
  const user = await updateUser(id, { active });
  await logAuditEvent({
    eventType: "USER_UPDATED",
    status: "ok",
    message: `Usuario ${user.email} ${active ? "activado" : "desactivado"}.`,
  });
  return user;
}

export async function removeUser(id: string): Promise<void> {
  const user = await deleteUser(id);
  await logAuditEvent({
    eventType: "USER_DELETED",
    status: "ok",
    message: `Usuario eliminado: ${user.email}.`,
  });
}

/** Used by the seed script's admin-bootstrap path check — never creates anything itself. */
export function hasAnyUsers(): Promise<boolean> {
  return countUsers().then((count) => count > 0);
}
