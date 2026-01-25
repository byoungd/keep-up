import type { Context } from "hono";

export type CoworkUserProfile = {
  id: string;
  email?: string;
  fullName?: string;
  imageUrl?: string;
  permissions?: string[];
};

function parsePermissions(value?: string): string[] | undefined {
  if (!value) {
    return undefined;
  }
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

function readHeader(c: Context, name: string): string | undefined {
  const value = c.req.header(name);
  return value?.trim() ? value : undefined;
}

function readHeaderUser(c: Context): Partial<CoworkUserProfile> {
  return {
    id: readHeader(c, "x-cowork-user-id"),
    email: readHeader(c, "x-cowork-user-email"),
    fullName: readHeader(c, "x-cowork-user-name") ?? readHeader(c, "x-cowork-user-full-name"),
    imageUrl: readHeader(c, "x-cowork-user-image"),
    permissions: parsePermissions(readHeader(c, "x-cowork-user-permissions")),
  };
}

function readEnvUser(): Partial<CoworkUserProfile> {
  return {
    id: process.env.COWORK_USER_ID,
    email: process.env.COWORK_USER_EMAIL,
    fullName: process.env.COWORK_USER_NAME ?? process.env.COWORK_USER_FULL_NAME,
    imageUrl: process.env.COWORK_USER_IMAGE,
    permissions: parsePermissions(process.env.COWORK_USER_PERMISSIONS),
  };
}

export function resolveCurrentUser(c: Context): CoworkUserProfile | null {
  const headerUser = readHeaderUser(c);
  const envUser = readEnvUser();
  const id = headerUser.id ?? envUser.id;
  if (!id) {
    return null;
  }
  return {
    id,
    email: headerUser.email ?? envUser.email,
    fullName: headerUser.fullName ?? envUser.fullName,
    imageUrl: headerUser.imageUrl ?? envUser.imageUrl,
    permissions: headerUser.permissions ?? envUser.permissions,
  };
}

export function resolveCurrentUserId(c: Context): string | undefined {
  return resolveCurrentUser(c)?.id;
}
