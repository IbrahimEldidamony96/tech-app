import { refundRoute } from "@/lib/refund-route";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, { params }: Context) {
  return refundRoute(request, { kind: "return", id: (await params).id }, "POST");
}
export async function PATCH(request: Request, { params }: Context) {
  return refundRoute(request, { kind: "return", id: (await params).id }, "PATCH");
}
export async function DELETE(request: Request, { params }: Context) {
  return refundRoute(request, { kind: "return", id: (await params).id }, "DELETE");
}
