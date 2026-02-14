import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Protected routes — flexi portal
  if (path.startsWith('/flexi') && !path.startsWith('/flexi/login')) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = '/flexi/login';
      url.searchParams.set('redirect', path);
      return NextResponse.redirect(url);
    }
  }

  // Protected routes — manager dashboard
  if (path.startsWith('/dashboard/flexis')) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = '/flexi/login'; // Or existing FritOS login
      return NextResponse.redirect(url);
    }
    // Check manager role
    const role = user.user_metadata?.role;
    if (role !== 'manager') {
      const url = request.nextUrl.clone();
      url.pathname = '/flexi/missions';
      return NextResponse.redirect(url);
    }
  }

  // QR pointage redirect — public URL that requires auth
  if (path.startsWith('/pointage/')) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = '/flexi/login';
      url.searchParams.set('redirect', path);
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
