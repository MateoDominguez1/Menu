import { NextResponse, type NextRequest } from "next/server";

/**
 * Verificacion optimista: solo comprueba que exista la cookie de sesion.
 * La validacion real (HMAC) se hace en cada pagina y Server Action con requireAuth().
 */
export function proxy(request: NextRequest) {
  if (!process.env.APP_PASSWORD) return NextResponse.next();
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/login")) return NextResponse.next();
  if (!request.cookies.get("mp_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon.*).*)"],
};
