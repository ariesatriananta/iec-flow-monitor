import { NextResponse, type NextRequest } from "next/server";
import { canAccessPath, isProtectedPath } from "@/lib/auth/rbac";

const SESSION_COOKIE_NAME = "iecnet_session";

type MiddlewareSession = {
  sub: string;
  role: "ADMIN" | "STAFF";
  exp: number;
};

const secret = () => process.env.SESSION_SECRET || "iecnet-dev-secret-change-me";

const toBase64 = (value: string) => {
  let normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  while (normalized.length % 4 !== 0) normalized += "=";
  return normalized;
};

const encodeUtf8 = (value: string) => new TextEncoder().encode(value);
const decodeUtf8 = (value: Uint8Array) => new TextDecoder().decode(value);

const toBase64Url = (value: Uint8Array) => {
  let binary = "";
  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const verifyToken = async (token?: string): Promise<MiddlewareSession | null> => {
  if (!token) return null;
  const [payloadPart, signaturePart] = token.split(".");
  if (!payloadPart || !signaturePart) return null;

  const key = await crypto.subtle.importKey(
    "raw",
    encodeUtf8(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const expectedSignatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encodeUtf8(payloadPart)
  );
  const expectedSignature = toBase64Url(new Uint8Array(expectedSignatureBuffer));

  if (expectedSignature !== signaturePart) return null;

  try {
    const payloadJson = decodeUtf8(
      Uint8Array.from(atob(toBase64(payloadPart)), (char) => char.charCodeAt(0))
    );
    const payload = JSON.parse(payloadJson) as MiddlewareSession;
    if (!payload?.sub || !payload?.role || !payload?.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api") || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  const isLoginPage = pathname === "/login";
  const requiresAuth = isProtectedPath(pathname);

  if (!isLoginPage && !requiresAuth) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifyToken(token);

  if (isLoginPage && session) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (requiresAuth && !session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (requiresAuth && session && !canAccessPath(session.role, pathname)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
