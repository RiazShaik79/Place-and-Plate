// Browser-side helpers for calling the API and preparing uploads.
import type { NutritionEstimate } from "./types";

/** An error whose message is safe and friendly to show to the user as-is. */
export class FriendlyError extends Error {}

export function toFriendlyMessage(err: unknown): string {
  return err instanceof FriendlyError ? err.message : "Something went wrong. Please try again.";
}

/**
 * `fetch` for the app's own API. A 401 means the session ended (signed out elsewhere, expired,
 * password changed on another device), so go to sign-in and come back here afterwards.
 */
export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status === 401) {
    const next = window.location.pathname + window.location.search;
    window.location.assign(`/login?expired=1&next=${encodeURIComponent(next)}`);
    throw new FriendlyError("Your session ended. Sign in again to continue.");
  }
  return res;
}

// Work that must reach the server while the session is still valid (e.g. removals waiting for
// their Undo window). Sign-out waits for these before ending the session.
const beforeSignOut = new Set<() => Promise<unknown>>();

export function onBeforeSignOut(task: () => Promise<unknown>): () => void {
  beforeSignOut.add(task);
  return () => beforeSignOut.delete(task);
}

/** Flush pending work, end the session, then go to the sign-in page. Throws FriendlyError if offline. */
export async function signOut(): Promise<void> {
  await Promise.allSettled([...beforeSignOut].map((task) => task()));
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    throw new FriendlyError("Couldn't reach the app to sign you out. Check your connection and try again.");
  }
  window.location.assign("/login?signedout=1");
}

// A one-time message shown as a toast on the next page (e.g. after sign-up or a password reset,
// which end in a full navigation). sessionStorage can be blocked, so failures are ignored.
const FLASH_KEY = "ct:flash";

export function setFlash(message: string) {
  try {
    sessionStorage.setItem(FLASH_KEY, message);
  } catch {
    // no storage: skip the message
  }
}

export function takeFlash(): string | null {
  try {
    const message = sessionStorage.getItem(FLASH_KEY);
    sessionStorage.removeItem(FLASH_KEY);
    return message;
  } catch {
    return null;
  }
}

/** Read `{ error, field }` from a failed auth/account response. */
export async function readFieldError(res: Response): Promise<{ message: string; field?: string }> {
  const body = (await res.json().catch(() => null)) as { error?: string; field?: string } | null;
  return { message: body?.error ?? "Something went wrong. Please try again.", field: body?.field };
}

const AI_STATUS_MESSAGES: Record<number, string> = {
  400: "That request didn't look right. Please check what you entered and try again.",
  413: "That photo is too large. Please use one under 10 MB.",
  415: "That file type isn't supported. Please use a JPEG, PNG, WebP or HEIC photo.",
  429: "The AI is busy right now. Please wait a few seconds and try again.",
};

/** Call an AI lookup route and return its estimate, or throw a FriendlyError. */
export async function requestEstimate<T = NutritionEstimate>(url: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await apiFetch(url, init);
  } catch (err) {
    if (err instanceof FriendlyError) throw err;
    throw new FriendlyError("Couldn't reach the server. Check your connection and try again.");
  }
  if (res.ok) return res.json();

  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  if (res.status === 500 && body?.error?.includes("GEMINI_API_KEY")) {
    throw new FriendlyError("AI lookup isn't set up yet: add GEMINI_API_KEY to .env and restart the app.");
  }
  throw new FriendlyError(
    AI_STATUS_MESSAGES[res.status] ?? "The AI couldn't analyze that right now. Please try again in a moment.",
  );
}

const MAX_DIMENSION = 1600;
const PASSTHROUGH_BYTES = 4 * 1024 * 1024;

/**
 * Downscale large photos to a JPEG (max 1600 px on the long side) before upload, so they
 * upload faster and stay under the 10 MB server limit. Returns the original file if it's
 * already small, or if the browser can't decode it (e.g. HEIC outside Safari).
 */
export async function prepareImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= PASSTHROUGH_BYTES) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.85),
    );
  } catch {
    return file;
  }
}
