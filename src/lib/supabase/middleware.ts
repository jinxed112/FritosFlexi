import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  try {
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

    // Login page — always accessible
    if (path === '/flexi/login') {
      return supabaseResponse;
    }

    // Protected routes — flexi portal
    if (path.startsWith('/flexi')) {
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
        url.pathname = '/flexi/login';
        return NextResponse.redirect(url);
      }
      const role = user.user_metadata?.role;
      if (role !== 'manager') {
        const url = request.nextUrl.clone();
        url.pathname = '/flexi/missions';
        return NextResponse.redirect(url);
      }
    }

    // QR pointage redirect
    if (path.startsWith('/pointage/')) {
      if (!user) {
        const url = request.nextUrl.clone();
        url.pathname = '/flexi/login';
        url.searchParams.set('redirect', path);
        return NextResponse.redirect(url);
      }
    }
  } catch (e) {
    // If middleware fails, let the request through
    console.error('Middleware error:', e);
  }

  return supabaseResponse;
}
