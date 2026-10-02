// This value is shared with next.config.ts and fixed when building the image.
export const APP_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function appPath(path: string): string {
  return `${APP_BASE_PATH}${path}`;
}
