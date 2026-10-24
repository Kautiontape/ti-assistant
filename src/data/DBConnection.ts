"use client";

import { initializeApp } from "firebase/app";
import {
  connectFirestoreEmulator,
  Firestore,
  getFirestore,
  initializeFirestore,
} from "firebase/firestore";
import { Optional } from "../util/types/types";

export default class DBConnection {
  private static db: Optional<Firestore>;

  public static get() {
    if (this.db) {
      return this.db;
    }
    // NEXT_PUBLIC_FIREBASE_* lets other deployments use their own project.
    const firebaseConfig = {
      apiKey:
        process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
        "AIzaSyCtN7R96q0Xa3wasE0b6JQRyb52e0KSINY",
      authDomain:
        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
        "twilight-imperium-360307.firebaseapp.com",
      projectId:
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
        "twilight-imperium-360307",
      storageBucket:
        process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
        "twilight-imperium-360307.appspot.com",
      messagingSenderId:
        process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
        "881312315045",
      appId:
        process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||
        "1:881312315045:web:d43e66019ce64ecf623f4c",
    };

    const isDev = !!process && process.env.NODE_ENV !== "production";
    if (isDev) {
      firebaseConfig.projectId =
        process.env.NEXT_PUBLIC_TI_PROJECT ?? firebaseConfig.projectId;
    }

    const app = initializeApp(firebaseConfig);

    // A page opened through a dev tunnel can't reach the visitor's own
    // 127.0.0.1, so it uses the emulator's HTTPS tunnel instead.
    const emulatorTunnel = process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_TUNNEL;
    const onLocalhost =
      typeof window === "undefined" ||
      ["localhost", "127.0.0.1"].includes(window.location.hostname);
    if (isDev && emulatorTunnel && !onLocalhost) {
      this.db = initializeFirestore(app, { host: emulatorTunnel, ssl: true });
      return this.db;
    }

    this.db = getFirestore(app);

    // Dev defaults to the local emulator; "off" talks to the real project.
    const emulatorHost =
      process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST || "127.0.0.1:8020";
    if (isDev && emulatorHost !== "off") {
      const [host, port] = emulatorHost.split(":");
      connectFirestoreEmulator(this.db, host ?? "127.0.0.1", Number(port));
    }

    return this.db;
  }
}
