import { NextResponse } from "next/server";
import { listFavorites, recentFoods } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { RECENT_DAYS, RECENT_LIMIT } from "@/lib/foods";
import { ISO_DATE_RE, shiftDate } from "@/lib/nutrition";

export const dynamic = "force-dynamic";

/**
 * GET ?today=YYYY-MM-DD (the client's day; the window is the 60 days before it)
 * → { recent: RecentFood[], favorites: FavoriteFood[] }
 */
export async function GET(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const today = new URL(req.url).searchParams.get("today");
  if (!today || !ISO_DATE_RE.test(today)) {
    return NextResponse.json({ error: "Query param `today` must be YYYY-MM-DD" }, { status: 400 });
  }
  const [recent, favorites] = await Promise.all([recentFoods(user.id, shiftDate(today, -RECENT_DAYS), RECENT_LIMIT), listFavorites(user.id)]);
  return NextResponse.json({ recent, favorites });
}
