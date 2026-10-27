import { NextResponse } from "next/server";
import { forgetOnDevice } from "@/lib/auth";

/** "Not you?" on the sign-in page: stop greeting the remembered person on this browser. */
export async function POST() {
  await forgetOnDevice();
  return new NextResponse(null, { status: 204 });
}
