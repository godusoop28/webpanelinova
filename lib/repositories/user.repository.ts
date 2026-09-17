import "server-only";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { Role } from "@/lib/permissions";

export function findUserByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
}

export function findUserById(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}

export function findManyUsers(companyId: string): Promise<User[]> {
  return prisma.user.findMany({ where: { companyId }, orderBy: { name: "asc" } });
}

export function countUsers(): Promise<number> {
  return prisma.user.count();
}

export interface CreateUserInput {
  companyId: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  active: boolean;
}

export function createUser(input: CreateUserInput): Promise<User> {
  return prisma.user.create({
    data: { ...input, email: input.email.trim().toLowerCase() },
  });
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: Role;
  active?: boolean;
  passwordHash?: string;
}

export function updateUser(id: string, input: UpdateUserInput): Promise<User> {
  return prisma.user.update({
    where: { id },
    data: { ...input, email: input.email ? input.email.trim().toLowerCase() : undefined },
  });
}

export function deleteUser(id: string): Promise<User> {
  return prisma.user.delete({ where: { id } });
}
