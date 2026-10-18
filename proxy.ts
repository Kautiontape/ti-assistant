import Negotiator from "negotiator";
import { NextRequest, NextResponse } from "next/server";
import { forkStart } from "./src/fork/home/proxy"; // ktn seam S8

const locales = ["en", "de", "fr", "ru", "pl", "pt-BR"];

function getLocale(request: NextRequest) {
  const lang_cookie = request.cookies.get("TI_LOCALE");
  if (lang_cookie) {
    return lang_cookie.value;
  }

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => (headers[key] = value));
  const languages = new Negotiator({ headers }).languages(locales);

  return languages[0] ?? "en";
}

export function proxy(request: NextRequest) {
  // Check if there is any supported locale in the pathname
  const { pathname } = request.nextUrl;
  const pathnameHasLocale = locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`,
  );

  if (pathnameHasLocale) {
    return forkStart(request); // ktn seam S8: the fork's start page at /<locale>
  }

  // Redirect if there is no locale
  const locale = getLocale(request);
  request.nextUrl.pathname = `/${locale}${pathname}`;
  // e.g. incoming request is /products
  // The new URL is now /en-US/products
  return NextResponse.redirect(request.nextUrl);
}

export const config = {
  matcher: [
    // Skip all internal paths (_next)
    "/((?!service-worker|\.well-known|images|api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
    // Optional: only run on root (/) URL
    // '/'
  ],
};
