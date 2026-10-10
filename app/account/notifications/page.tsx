import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { MarkNotificationsRead } from "@/components/account/mark-notifications-read";
export const dynamic="force-dynamic";
export default async function NotificationsPage(){const s=await auth();if(!s?.user)redirect('/login');const items=await prisma.notification.findMany({where:{userId:s.user.id},orderBy:{createdAt:'desc'},take:100});return <main className="mx-auto max-w-3xl px-4 py-10"><div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Notifications</h1><MarkNotificationsRead/></div><div className="mt-6 divide-y divide-steel/10 rounded border border-steel/15">{items.map(n=><div key={n.id} className={`p-4 ${n.readAt?'':'bg-steel/5'}`}><div className="flex justify-between gap-4"><strong>{n.title}</strong><span className="text-xs text-steel">{n.createdAt.toLocaleString()}</span></div><p className="mt-1 text-sm text-steel">{n.message}</p>{n.link?<Link className="mt-2 inline-block text-sm underline" href={n.link}>View</Link>:null}</div>)}{!items.length?<p className="p-6 text-sm text-steel">No notifications yet.</p>:null}</div></main>}
