import { NextResponse } from "next/server";
import { placesThrottle, requireUser } from "@/lib/auth";
import { PlacesError, placeAddress, placesConfigured } from "@/lib/places";

/** GET ?placeId=&sessionToken= → { address }. Never saves; the form does that. */
export async function GET(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const wait = placesThrottle.blockedMinutes(String(user.id));
  if (wait > 0) return NextResponse.json({ error: "Address search is busy" }, { status: 429 });
  if (!placesConfigured()) return NextResponse.json({ error: "Address search isn't set up" }, { status: 503 });
  const params = new URL(req.url).searchParams;
  const placeId = params.get("placeId") ?? "";
  const sessionToken = (params.get("sessionToken") ?? "").slice(0, 64);
  if (!/^[A-Za-z0-9_-]{10,300}$/.test(placeId)) {
    return NextResponse.json({ error: "Invalid placeId" }, { status: 400 });
  }
  placesThrottle.record(String(user.id));
  try {
    return NextResponse.json({ address: await placeAddress(placeId, sessionToken) });
  } catch (err) {
    if (err instanceof PlacesError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
