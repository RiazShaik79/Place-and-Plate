import { NextResponse } from "next/server";
import { placesThrottle, requireUser } from "@/lib/auth";
import { autocomplete, PlacesError, placesConfigured } from "@/lib/places";
import { readJson, str } from "@/lib/http";

/** Body: { input, sessionToken } → { suggestions: [{ placeId, main, secondary }] }. 503 when not configured. */
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const wait = placesThrottle.blockedMinutes(String(user.id));
  if (wait > 0) return NextResponse.json({ error: "Address search is busy" }, { status: 429 });
  if (!placesConfigured()) return NextResponse.json({ error: "Address search isn't set up" }, { status: 503 });
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const input = str(body.input).trim().slice(0, 200);
  const sessionToken = str(body.sessionToken).slice(0, 64);
  if (input.length < 3) return NextResponse.json({ suggestions: [] });
  placesThrottle.record(String(user.id));
  try {
    return NextResponse.json({ suggestions: await autocomplete(input, sessionToken) });
  } catch (err) {
    if (err instanceof PlacesError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
