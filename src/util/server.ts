import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFile } from "fs/promises";
import jsSHA from "jssha";
import { cookies } from "next/headers";
import path from "path";
import { createIntl, createIntlCache, IntlShape } from "react-intl";
import "server-only";
import { intlErrorFn } from "./util";

export const SCHEMA_VERSION = "2.0.0" as const;

export async function getMessages(
  locale: string,
): Promise<Record<string, string>> {
  const messages = await import(`../../server/compiled-lang/${locale}.json`);

  return JSON.parse(JSON.stringify(messages));
}

export async function getIntl(locale: string): Promise<IntlShape> {
  const intlCache = createIntlCache();
  const messages = await getMessages(locale);

  return createIntl({ locale, messages, onError: intlErrorFn }, intlCache);
}

export async function getSessionIdFromCookie() {
  const cookieValues = await cookies();
  const sessionIdCookie = cookieValues.get("session");
  if (!sessionIdCookie) {
    return;
  }
  return sessionIdCookie.value;
}

export async function setSessionIdCookie(sessionId: string) {
  const cookieValues = await cookies();
  cookieValues.set("session", sessionId);
}

export function hashPassword(password: string) {
  const sha = new jsSHA("SHA-512", "TEXT", { encoding: "UTF8" });
  sha.update(password);
  return sha.getHash("HEX");
}

const SERVICE_ACCOUNT_PATH = path.join(
  process.cwd(),
  "server",
  "twilight-imperium-360307-ea7cce25efeb.json",
);

let adminCredential: ReturnType<typeof readAdminCredential> | undefined;
async function readAdminCredential() {
  // Lets other deployments supply their own service account key.
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return applicationDefault();
  }
  // Read at runtime so builds don't require the key file to exist.
  const serviceAccount = JSON.parse(
    await readFile(SERVICE_ACCOUNT_PATH, "utf8"),
  );
  return cert(serviceAccount);
}
// Read once, and before getApps(), so two first requests can't both
// initialize the app.
function getAdminCredential() {
  adminCredential ??= readAdminCredential();
  return adminCredential;
}

export async function getFirestoreAdmin() {
  const env = process.env.NODE_ENV;
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  const credential =
    env === "production" || !emulator ? await getAdminCredential() : undefined;
  const apps = getApps();
  if (apps.length > 0) {
    return getFirestore();
  }
  const projectId = process.env.NEXT_PUBLIC_TI_PROJECT;
  if (credential) {
    initializeApp({
      credential,
    });
  } else {
    initializeApp({ projectId });
  }

  return getFirestore();
}
