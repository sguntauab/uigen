// @vitest-environment node
import { vi, test, expect, beforeEach, describe } from "vitest";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";

vi.mock("server-only", () => ({}));

const mockCookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => mockCookieStore),
}));

// Must be imported after mocks are set up
const { createSession, getSession, deleteSession, verifySession } =
  await import("@/lib/auth");

const JWT_SECRET = new TextEncoder().encode("development-secret-key");

async function createTestToken(
  payload: object,
  options: { expiresIn?: string | Date; secret?: Uint8Array } = {}
) {
  const { expiresIn = "7d", secret = JWT_SECRET } = options;
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(expiresIn)
    .setIssuedAt()
    .sign(secret);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createSession", () => {
  test("sets an http-only cookie with a JWT token", async () => {
    await createSession("user-123", "user@example.com");

    expect(mockCookieStore.set).toHaveBeenCalledOnce();
    const [name, token, options] = mockCookieStore.set.mock.calls[0];

    expect(name).toBe("auth-token");
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3); // valid JWT structure
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
    expect(options.expires).toBeInstanceOf(Date);
  });

  test("token contains correct userId and email", async () => {
    await createSession("user-123", "user@example.com");

    const token = mockCookieStore.set.mock.calls[0][1] as string;
    const { jwtVerify } = await import("jose");
    const { payload } = await jwtVerify(token, JWT_SECRET);

    expect(payload.userId).toBe("user-123");
    expect(payload.email).toBe("user@example.com");
  });

  test("sets secure flag in production", async () => {
    const original = process.env.NODE_ENV;
    // @ts-expect-error overriding read-only for test
    process.env.NODE_ENV = "production";

    await createSession("user-123", "user@example.com");
    const options = mockCookieStore.set.mock.calls[0][2];
    expect(options.secure).toBe(true);

    // @ts-expect-error restoring
    process.env.NODE_ENV = original;
  });
});

describe("getSession", () => {
  test("returns session payload for a valid token", async () => {
    const token = await createTestToken({
      userId: "user-123",
      email: "user@example.com",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    mockCookieStore.get.mockReturnValue({ value: token });

    const session = await getSession();

    expect(session).not.toBeNull();
    expect(session?.userId).toBe("user-123");
    expect(session?.email).toBe("user@example.com");
  });

  test("returns null when no cookie is present", async () => {
    mockCookieStore.get.mockReturnValue(undefined);

    const session = await getSession();

    expect(session).toBeNull();
  });

  test("returns null for an expired token", async () => {
    const token = await createTestToken(
      { userId: "user-123", email: "user@example.com" },
      { expiresIn: new Date(Date.now() - 1000) }
    );
    mockCookieStore.get.mockReturnValue({ value: token });

    const session = await getSession();

    expect(session).toBeNull();
  });

  test("returns null for a token signed with a different secret", async () => {
    const wrongSecret = new TextEncoder().encode("wrong-secret");
    const token = await createTestToken(
      { userId: "user-123", email: "user@example.com" },
      { secret: wrongSecret }
    );
    mockCookieStore.get.mockReturnValue({ value: token });

    const session = await getSession();

    expect(session).toBeNull();
  });

  test("returns null for a malformed token", async () => {
    mockCookieStore.get.mockReturnValue({ value: "not.a.jwt" });

    const session = await getSession();

    expect(session).toBeNull();
  });
});

describe("deleteSession", () => {
  test("deletes the auth-token cookie", async () => {
    await deleteSession();

    expect(mockCookieStore.delete).toHaveBeenCalledOnce();
    expect(mockCookieStore.delete).toHaveBeenCalledWith("auth-token");
  });
});

describe("verifySession", () => {
  test("returns session payload for a valid token in request", async () => {
    const token = await createTestToken({
      userId: "user-456",
      email: "other@example.com",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    const request = new NextRequest("http://localhost/api/test", {
      headers: { cookie: `auth-token=${token}` },
    });

    const session = await verifySession(request);

    expect(session).not.toBeNull();
    expect(session?.userId).toBe("user-456");
    expect(session?.email).toBe("other@example.com");
  });

  test("returns null when no cookie is in request", async () => {
    const request = new NextRequest("http://localhost/api/test");

    const session = await verifySession(request);

    expect(session).toBeNull();
  });

  test("returns null for an expired token in request", async () => {
    const token = await createTestToken(
      { userId: "user-456", email: "other@example.com" },
      { expiresIn: new Date(Date.now() - 1000) }
    );
    const request = new NextRequest("http://localhost/api/test", {
      headers: { cookie: `auth-token=${token}` },
    });

    const session = await verifySession(request);

    expect(session).toBeNull();
  });

  test("returns null for a token signed with a different secret in request", async () => {
    const wrongSecret = new TextEncoder().encode("wrong-secret");
    const token = await createTestToken(
      { userId: "user-456", email: "other@example.com" },
      { secret: wrongSecret }
    );
    const request = new NextRequest("http://localhost/api/test", {
      headers: { cookie: `auth-token=${token}` },
    });

    const session = await verifySession(request);

    expect(session).toBeNull();
  });
});
