import { redirect } from "next/navigation";
import { enabledModules } from "@/lib/modules";
import { currentUser } from "@/lib/session";
import { config } from "@/lib/config";
import { ProcessorWorkspace } from "./processor-workspace";

export default async function WorkspacePage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const modules = enabledModules().filter((module) => user.allowedModules.includes(module));

  return <ProcessorWorkspace user={{ name: user.name, email: user.email }} modules={modules} mockMode={config.mockMode} />;
}
