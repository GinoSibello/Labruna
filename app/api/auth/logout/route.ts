import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/security";
import { SESSION_COOKIE } from "@/lib/session";
import { APP_BASE_PATH } from "@/lib/app-path";
import { errorResponse } from "@/lib/errors";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: APP_BASE_PATH || "/",
      expires: new Date(0),
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
