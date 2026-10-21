"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type GuestOrder = {
  id: string;
  status: string;
  paymentStatus: string;
  total: string | number;
  createdAt: string;
  items: {
    id: string; productName: string; quantity: number; totalPrice: string | number;
  }[];
  events: { id: string; title: string; createdAt: string }[];
};

async function readGuestOrder(id: string, token?: string): Promise<GuestOrder> {
  const path = `/api/guest-orders/${encodeURIComponent(id)}`;
  if (token) {
    const exchanged = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      cache: "no-store",
    });
    if (!exchanged.ok) {
      throw new Error(exchanged.status === 429
        ? "Too many attempts. Try again later."
        : "The access token is invalid or has expired.");
    }
  }

  const res = await fetch(path, { credentials: "same-origin", cache: "no-store" });
  if (!res.ok) {
    throw new Error(res.status === 503
      ? "Guest order access is temporarily unavailable."
      : "Access expired. Enter the original order token to open this order.");
  }
  const body = await res.json();
  return body.data as GuestOrder;
}

export default function GuestOrderPage() {
  const { id } = useParams<{ id: string }>();
  return <GuestOrderDetails key={id} id={id} />;
}

function GuestOrderDetails({ id }: { id: string }) {
  const [order, setOrder] = useState<GuestOrder | null>(null);
  const [token, setToken] = useState("");
  const [working, setWorking] = useState(true);
  const [error, setError] = useState("");
  // Keep only a shared in-flight promise for StrictMode. The historical
  // bearer is erased from this ref immediately after exchange begins.
  const initial = useRef<{
    id: string; token: string; promise: Promise<GuestOrder> | null;
  } | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    if (initial.current?.id !== id) {
      const current = new URL(window.location.href);
      const legacyUrlToken = current.searchParams.get("token") ?? "";
      if (current.searchParams.has("token")) {
        // Remove the bearer BEFORE any authenticated fetch/navigation.
        current.searchParams.delete("token");
        window.history.replaceState(
          window.history.state, "", current.pathname + current.search + current.hash,
        );
      }
      const storageKey = `guestOrderToken:${id}`;
      const oldStoredToken = window.localStorage.getItem(storageKey) ?? "";
      window.localStorage.removeItem(storageKey);
      initial.current = {
        id, token: legacyUrlToken || oldStoredToken, promise: null,
      };
    }

    if (!initial.current.promise) {
      const oneTimeToken = initial.current.token;
      initial.current.token = "";
      initial.current.promise = readGuestOrder(id, oneTimeToken || undefined);
    }
    initial.current.promise
      .then(data => { if (!cancelled) { setOrder(data); setError(""); } })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Access unavailable");
      })
      .finally(() => { if (!cancelled) setWorking(false); });

    return () => { cancelled = true; };
  }, [id]);

  async function openWithToken(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token.trim()) return;
    setWorking(true);
    setError("");
    try {
      const result = await readGuestOrder(id, token.trim());
      setOrder(result);
      // Bearers are not retained in React state, localStorage or URLs.
      setToken("");
      initial.current = { id, token: "", promise: Promise.resolve(result) };
    } catch (e) {
      setError(e instanceof Error ? e.message : "Access unavailable");
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-xs font-semibold uppercase text-signal">Guest order</p>
      <h1 className="mt-2 text-2xl font-bold">Order {id}</h1>
      {working && <p className="mt-4 text-sm text-steel">Checking secure access…</p>}
      {error && <p role="alert" className="mt-4 text-sm text-alert">{error}</p>}
      {!working && !order && (
        <form onSubmit={openWithToken} className="mt-6 space-y-3">
          <label htmlFor="guest-token" className="block text-sm font-medium text-ink">
            Original guest order access token
          </label>
          <input
            id="guest-token"
            type="password"
            value={token}
            onChange={e => setToken(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            required
            className="w-full rounded-md border border-steel/25 px-3 py-2"
          />
          <p className="text-xs text-steel">
            Legacy guests can copy the token from their original order link.
            Access stays in a secure browser cookie for 15 minutes.
          </p>
          <button type="submit" className="rounded bg-ink px-4 py-2 text-sm font-semibold text-paper">
            Open order securely
          </button>
        </form>
      )}
      {order && (
        <>
          <p className="mt-2 text-sm text-steel">
            {order.status} · {order.paymentStatus}
          </p>
          <div className="mt-6 rounded border p-4">
            {order.items.map(item => (
              <div key={item.id} className="flex justify-between gap-3 py-2 text-sm">
                <span>{item.productName} × {item.quantity}</span>
                <span>EGP {Number(item.totalPrice).toLocaleString()}</span>
              </div>
            ))}
            <div className="mt-3 flex justify-between border-t pt-3 font-semibold">
              <span>Total</span><span>EGP {Number(order.total).toLocaleString()}</span>
            </div>
          </div>
          <section className="mt-8">
            <h2 className="font-semibold">Timeline</h2>
            {order.events.map(event => (
              <div key={event.id} className="mt-3 border-s ps-4">
                <p className="text-sm font-medium">{event.title}</p>
                <p className="text-xs text-steel">{new Date(event.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </section>
        </>
      )}
      <Link href="/" className="mt-8 inline-block underline">Continue shopping</Link>
    </main>
  );
}
