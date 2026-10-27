"use client";

import { useEffect, useState } from "react";
import { formatLongDate, formatShortDate, todayISO } from "@/lib/nutrition";
import type { User } from "@/lib/types";
import { Alert, BarChart, Logo, Runner, Utensils } from "./Icons";
import ResendVerification from "./ResendVerification";
import UserMenu from "./UserMenu";
import { APP_NAME } from "@/lib/brand";
import { HOME_PATH } from "@/lib/account";

export type Section = "food" | "exercise" | "dashboard";

const SECTIONS: { id: Section; href: string; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard", href: HOME_PATH, label: "Dashboard", icon: <BarChart className="h-[18px] w-[18px]" /> },
  { id: "food", href: "/", label: "Food", icon: <Utensils className="h-[18px] w-[18px]" /> },
  { id: "exercise", href: "/exercise", label: "Activity", icon: <Runner className="h-[18px] w-[18px]" /> },
];

/**
 * App bar: brand, the Dashboard / Food / Activity switch, today's date and the account menu.
 * The switch sits inline from `md` up and as a second row on phones.
 */
export default function Header({ user, section }: { user: User; section?: Section }) {
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(todayISO()), []);

  return (
    <>
    <header className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur supports-[backdrop-filter]:bg-surface/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-8">
          <a href={HOME_PATH} className="flex shrink-0 items-center gap-2.5 rounded-lg">
            <Logo className="h-8 w-8" />
            <span className="text-[17px] font-bold tracking-tight">{APP_NAME}</span>
          </a>
          <SectionNav section={section} className="hidden md:flex" />
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Short date on phones so the account button still fits next to the name. */}
          <p className="text-sm text-muted" suppressHydrationWarning>
            <span className="hidden sm:inline">{today && formatLongDate(today)}</span>
            <span className="sm:hidden">{today && formatShortDate(today)}</span>
          </p>
          <UserMenu user={user} />
        </div>
      </div>
      <div className="px-4 pb-2.5 md:hidden">
        <SectionNav section={section} className="flex" stretch />
      </div>
    </header>
    {/* Until the sign-in email is confirmed: a quiet reminder that scrolls away with the page. */}
    {!user.emailVerified && (
      <div className="border-b border-line bg-near-soft text-[#7a5408]">
        <div className="mx-auto flex max-w-6xl items-start gap-2 px-4 py-2.5 text-sm sm:px-6">
          <Alert className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="min-w-0">
            Confirm your email address. We sent a link to <span className="font-semibold break-words">{user.email}</span>.{" "}
            <ResendVerification />
          </p>
        </div>
      </div>
    )}
    </>
  );
}

function SectionNav({ section, className, stretch = false }: { section?: Section; className: string; stretch?: boolean }) {
  return (
    <nav aria-label="Sections" className={`${className} items-center gap-1 rounded-full bg-sunken p-1`}>
      {SECTIONS.map((s) => {
        const active = s.id === section;
        return (
          <a
            key={s.id}
            href={s.href}
            aria-current={active ? "page" : undefined}
            className={`flex h-9 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${stretch ? "flex-1" : ""} ${
              active ? "bg-surface text-ink shadow-[0_1px_3px_rgba(26,36,32,0.12)]" : "text-muted hover:text-ink"
            }`}
          >
            <span className={active ? "text-basil" : ""}>{s.icon}</span>
            {s.label}
          </a>
        );
      })}
    </nav>
  );
}
