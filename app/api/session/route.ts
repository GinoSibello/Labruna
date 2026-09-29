import { NextResponse } from "next/server";
import { enabledModules } from "@/lib/modules";
import { requireUser } from "@/lib/security";
import { errorResponse } from "@/lib/errors";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email },
      allowedModules: enabledModules().filter((module) => user.allowedModules.includes(module)),
      expiresAt: new Date(user.exp * 1000).toISOString(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
