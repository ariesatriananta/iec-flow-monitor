import { createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE_NAME = "iecnet_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export type SessionRole = "ADMIN" | "STAFF";

type SessionPayload = {
  sub: string;
  role: SessionRole;
  exp: number;
};

type SessionInput = {
  userId: string;
  role: SessionRole;
};

const toBase64Url = (value: string) =>
  Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const fromBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
};

const getSessionSecret = () => {
  return process.env.SESSION_SECRET || "iecnet-dev-secret-change-me";
};

const sign = (content: string) => {
  const secret = getSessionSecret();
  return createHmac("sha256", secret).update(content).digest("base64url");
};

export const createSessionToken = ({ userId, role }: SessionInput) => {
  const payload: SessionPayload = {
    sub: userId,
    role,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  const encoded = toBase64Url(JSON.stringify(payload));
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
};

export const parseSessionToken = (token?: string | null): SessionPayload | null => {
  if (!token) return null;

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = sign(encodedPayload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) return null;

  try {
    const parsed = JSON.parse(fromBase64Url(encodedPayload)) as SessionPayload;
    if (!parsed.sub || !parsed.role || !parsed.exp) return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
} as const;
