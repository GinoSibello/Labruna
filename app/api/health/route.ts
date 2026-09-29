import { NextResponse } from "next/server";
import { enabledModules } from "@/lib/modules";
import { config } from "@/lib/config";

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      modules: enabledModules(),
      integration: config.mockMode ? "mock" : "n8n",
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
