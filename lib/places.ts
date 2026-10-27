// Server only: address search with the Google Places API (New). Needs GOOGLE_MAPS_API_KEY with
// "Places API (New)" enabled (and billing on the Google Cloud project). The key never reaches the
// browser: the client calls /api/places/*, which call Google from here.
import type { Address } from "./types";

const BASE = "https://places.googleapis.com/v1";
const TIMEOUT_MS = 8000;

export function placesConfigured(): boolean {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim());
}

export class PlacesError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export interface PlaceSuggestion {
  placeId: string;
  main: string; // e.g. "221B Baker Street"
  secondary: string; // e.g. "London, UK"
}

async function call(url: string, init: RequestInit & { fieldMask?: string }): Promise<unknown> {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!key) throw new PlacesError("Address search isn't set up", 503);
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        ...(init.fieldMask ? { "X-Goog-FieldMask": init.fieldMask } : {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new PlacesError("Couldn't reach Google address search", 502);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`Places API error ${res.status}: ${detail.slice(0, 400)}`);
    if (/referer/i.test(detail)) {
      console.error(
        "GOOGLE_MAPS_API_KEY has a website (HTTP referrer) restriction, but these calls come from the server, which sends no referrer. In Google Cloud → Credentials → this key → Application restrictions, choose None (local) or IP addresses (hosted), keep the API restriction on Places API (New).",
      );
    } else if (res.status === 400 || res.status === 403) {
      console.error(
        "Check GOOGLE_MAPS_API_KEY: it must be a valid Google Cloud key with \"Places API (New)\" enabled and billing turned on for its project.",
      );
    }
    throw new PlacesError(res.status === 429 ? "Address search is busy" : "Address search failed", res.status === 429 ? 429 : 502);
  }
  return res.json();
}

/** Address suggestions for what the user has typed so far. */
export async function autocomplete(input: string, sessionToken: string): Promise<PlaceSuggestion[]> {
  const data = (await call(`${BASE}/places:autocomplete`, {
    method: "POST",
    body: JSON.stringify({ input, sessionToken }),
  })) as { suggestions?: { placePrediction?: { placeId?: string; text?: { text?: string }; structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } } } }[] };
  return (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => Boolean(p?.placeId))
    .slice(0, 5)
    .map((p) => ({
      placeId: p.placeId!,
      main: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
      secondary: p.structuredFormat?.secondaryText?.text ?? "",
    }));
}

type Component = { longText?: string; shortText?: string; types?: string[] };

/** Map Google's address components onto our six fields (works for US, UK, EU and Indian formats). */
export function toAddress(components: Component[]): Address {
  const get = (type: string, short = false) => {
    const c = components.find((x) => x.types?.includes(type));
    return (short ? c?.shortText : c?.longText) ?? "";
  };
  const street = [get("street_number"), get("route")].filter(Boolean).join(" ");
  const premise = get("premise");
  const line1 = street || premise || get("sublocality_level_1");
  const line2 = [get("subpremise"), street && premise ? premise : "", street ? get("sublocality_level_1") || get("neighborhood") : ""]
    .filter(Boolean)
    .join(", ");
  return {
    line1,
    line2,
    city: get("locality") || get("postal_town") || get("administrative_area_level_2"),
    region: get("administrative_area_level_1"),
    postalCode: get("postal_code"),
    country: get("country"),
  };
}

/** The full address for a picked suggestion. Passing the same session token closes the billing session. */
export async function placeAddress(placeId: string, sessionToken: string): Promise<Address> {
  const data = (await call(`${BASE}/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}`, {
    method: "GET",
    fieldMask: "addressComponents",
  })) as { addressComponents?: Component[] };
  return toAddress(data.addressComponents ?? []);
}
