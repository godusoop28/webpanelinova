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

const BCRYPT_ROUNDS = 10;

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
  const user = await findUserByEmail(email);
  if (!user || !user.active) return null;
  const valid = await bcrypt.compare(password, user.passwordHash ?? "");
  if (!valid) return null;
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
