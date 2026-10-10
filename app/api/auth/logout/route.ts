import { authClient } from "@/lib/db/auth";

// Called by the "Log out" button (a plain HTML form, so it works without JavaScript).
export async function POST(request: Request) {
  const supabase = await authClient();
  await supabase.auth.signOut();
  // 303 = "go to this page with GET", the normal answer after a form POST.
  return Response.redirect(new URL("/portal/login", request.url), 303);
}
