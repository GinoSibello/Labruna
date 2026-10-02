export const MODULES = ["remitos", "chapas", "cheques"] as const;

export type ModuleSlug = (typeof MODULES)[number];
export type ModuleOperation = "create" | "update";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  enabled: boolean;
  allowedModules: ModuleSlug[];
}

export interface UserRecord extends AppUser {
  passwordHash: string;
}

export interface SessionUser extends AppUser {
  exp: number;
}

export interface PendingMetadata {
  requestId: string;
  userId: string;
  module: ModuleSlug;
  originalName: string;
  mimeType: string;
  fileHash: string;
  createdAt: string;
  expiresAt: string;
}

export interface AnalyzeResponse {
  requestId: string;
  module: ModuleSlug;
  status: "review";
  operation: ModuleOperation;
  data: Record<string, unknown>;
  warnings: string[];
  expiresAt: string;
}

export interface ConfirmResponse {
  requestId: string;
  status: "saved";
  operation: "created" | "updated";
  recordKey: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fieldErrors?: Record<string, string[]>;
    retryable: boolean;
  };
}
