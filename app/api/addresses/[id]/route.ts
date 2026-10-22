import { validateAddressLocation } from "@/lib/address-location";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import { addressSchema } from "@/lib/validations/address";

class AddressNotFoundError extends Error {}

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const { session, error } = await requireUser();
  if (error) return error;
  const userId = session!.user.id;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = addressSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try { await validateAddressLocation(parsed.data); }
  catch { return NextResponse.json({ error: "Carrier location does not match the selected address. Re-select the city and district." }, { status: 400 }); }

  try {
    const address = await prisma.$transaction(async (tx) => {
      // The lock returns void; execute it without deserializing a result set.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;

      const existing = await tx.address.findFirst({ where: { id, userId } });
      if (!existing) throw new AddressNotFoundError();

      if (parsed.data.isDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }

      return tx.address.update({ where: { id }, data: parsed.data });
    });

    return NextResponse.json({ data: address });
  } catch (err) {
    if (err instanceof AddressNotFoundError) {
      return NextResponse.json({ error: "Address not found" }, { status: 404 });
    }
    throw err;
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { session, error } = await requireUser();
  if (error) return error;
  const userId = session!.user.id;
  const { id } = await params;

  try {
    await prisma.$transaction(async (tx) => {
      // The lock returns void; execute it without deserializing a result set.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;

      const existing = await tx.address.findFirst({ where: { id, userId } });
      if (!existing) throw new AddressNotFoundError();

      await tx.address.delete({ where: { id } });

      if (existing.isDefault) {
        const next = await tx.address.findFirst({
          where: { userId },
          orderBy: { createdAt: "desc" },
        });
        if (next) {
          await tx.address.update({
            where: { id: next.id },
            data: { isDefault: true },
          });
        }
      }
    });

    return NextResponse.json({ data: { id } });
  } catch (err) {
    if (err instanceof AddressNotFoundError) {
      return NextResponse.json({ error: "Address not found" }, { status: 404 });
    }
    throw err;
  }
}
