import type { ReactNode, SVGProps } from "react";

export type StorefrontIconName = "arrow" | "phone" | "laptop" | "headphones" | "grid" | "shield" | "sliders" | "compare" | "bag" | "heart";

export function StorefrontIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: StorefrontIconName }) {
  const paths: Record<StorefrontIconName, ReactNode> = {
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    phone: <><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M10 5h4M11 18.5h2" /></>,
    laptop: <><rect x="4" y="3.5" width="16" height="12" rx="1.5" /><path d="m4 15.5-2 4h20l-2-4M9 17.5h6" /></>,
    headphones: <><path d="M4 14v-3a8 8 0 0 1 16 0v3" /><rect x="3" y="11" width="4" height="9" rx="2" /><rect x="17" y="11" width="4" height="9" rx="2" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>,
    sliders: <><path d="M4 7h16M4 17h16" /><rect x="7" y="4" width="4" height="6" rx="2" /><rect x="14" y="14" width="4" height="6" rx="2" /></>,
    compare: <><path d="M7 3v18M17 3v18M3 7h8M13 17h8" /><circle cx="7" cy="7" r="3" /><circle cx="17" cy="17" r="3" /></>,
    bag: <><path d="M5 7h14l1 14H4L5 7Z" /><path d="M8 8V6a4 4 0 0 1 8 0v2" /></>,
    heart: <path d="M20.5 4.8a5.5 5.5 0 0 0-8 0l-.5.6-.5-.6a5.5 5.5 0 0 0-8 7.5L12 21l8.5-8.7a5.5 5.5 0 0 0 0-7.5Z" />,
  };
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}

export function categoryIcon(slug: string): StorefrontIconName {
  if (/phone|mobile/i.test(slug)) return "phone";
  if (/laptop|computer|tablet/i.test(slug)) return "laptop";
  if (/audio|headphone|accessor/i.test(slug)) return "headphones";
  return "grid";
}
