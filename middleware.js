import { NextResponse } from 'next/server';

// Basic Auth sederhana untuk lindungi dashboard admin.
// Username & password diambil dari environment variable di Railway,
// TIDAK di-hardcode di kode supaya aman.
export function middleware(req) {
  const basicAuth = req.headers.get('authorization');

  const validUser = process.env.ADMIN_USERNAME || 'admin';
  const validPass = process.env.ADMIN_PASSWORD;

  // Kalau ADMIN_PASSWORD belum di-set, dashboard tetap terbuka
  // (supaya tidak lock-out saat development). Set variable ini di Railway!
  if (!validPass) {
    return NextResponse.next();
  }

  if (basicAuth) {
    const authValue = basicAuth.split(' ')[1];
    const [user, pwd] = Buffer.from(authValue, 'base64').toString().split(':');

    if (user === validUser && pwd === validPass) {
      return NextResponse.next();
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="English Hive Admin"' },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};