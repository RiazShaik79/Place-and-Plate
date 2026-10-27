import { NextResponse } from "next/server";
import { endSession } from "@/lib/auth";

export async function POST() {
  await endSession();
  return new NextResponse(null, { status: 204 });
}
