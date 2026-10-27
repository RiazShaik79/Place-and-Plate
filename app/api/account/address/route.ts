import { NextResponse } from "next/server";
import { updateAddress } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ADDRESS_FIELD_MAX } from "@/lib/account";
import { fieldError, readJson, str } from "@/lib/http";
import type { Address } from "@/lib/types";

const FIELDS = ["line1", "line2", "city", "region", "postalCode", "country"] as const;

/** Body: { address: Address | null } → { user }. Street, city and country are required; null removes it. */
export async function PUT(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  if (body.address === null) return NextResponse.json({ user: await updateAddress(user.id, null) });
  const raw = (body.address ?? {}) as Record<string, unknown>;
  const address = Object.fromEntries(FIELDS.map((f) => [f, str(raw[f]).trim()])) as unknown as Address;
  for (const f of FIELDS) {
    if (address[f].length > ADDRESS_FIELD_MAX) return fieldError(f, `Use ${ADDRESS_FIELD_MAX} characters or fewer.`);
  }
  if (!address.line1) return fieldError("line1", "Enter the street address.");
  if (!address.city) return fieldError("city", "Enter the town or city.");
  if (!address.country) return fieldError("country", "Enter the country.");
  return NextResponse.json({ user: await updateAddress(user.id, address) });
}
