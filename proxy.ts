// Runs before every /portal page and /api/portal route.
// (Next.js 16 renamed middleware.ts to proxy.ts; it is the same idea.)
//
// 1. Refreshes the clinician's login cookie if it is about to expire.
// 2. Not logged in → pages go to /portal/login, API routes get a 401.
//
// This is the first gate only. Every /api/portal route ALSO checks the login
// and the clinician's facility itself (requireClinician in lib/db/auth.ts).
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet, headers) => {
          // Pass refreshed cookies both to the page (request) and the browser (response).
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const loggedIn = Boolean(data?.claims.sub);
  const path = request.nextUrl.pathname;

  if (!loggedIn && path.startsWith("/api/portal")) {
    return Response.json({ error: "Your login expired. Please log in again." }, { status: 401 });
  }
  if (!loggedIn && path.startsWith("/portal") && path !== "/portal/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/portal/login";
    url.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/portal/:path*", "/api/portal/:path*"],
};
