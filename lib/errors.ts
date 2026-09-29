import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { ApiErrorBody } from "@/lib/types";

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly retryable = false,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export function errorResponse(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          fieldErrors: error.fieldErrors,
          retryable: error.retryable,
        },
      },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const field = issue.path.join(".") || "data";
      fieldErrors[field] = [...(fieldErrors[field] ?? []), issue.message];
    }
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Revisá los campos marcados antes de continuar.",
          fieldErrors,
          retryable: false,
        },
      },
      { status: 422 },
    );
  }

  console.error(JSON.stringify({ level: "error", event: "unhandled_error", message: String(error) }));
  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "No pudimos completar la operación. Intentá nuevamente.",
        retryable: true,
      },
    },
    { status: 500 },
  );
}
