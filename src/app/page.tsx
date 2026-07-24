import { redirect } from "next/navigation";
import { getAccessContext } from "@/server/auth-context";

export default async function RootPage() {
  const context = await getAccessContext();
  redirect(context ? "/dashboard" : "/login");
}
