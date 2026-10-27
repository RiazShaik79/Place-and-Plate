"use client";

import { useEffect, useRef, useState } from "react";
import { initials } from "@/lib/account";
import { signOut, toFriendlyMessage } from "@/lib/client";
import type { User } from "@/lib/types";
import { ChevronDown, Person, SignOut } from "./Icons";
import Spinner from "./Spinner";

export function Avatar({ name, className = "h-9 w-9 text-sm" }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full bg-basil-soft font-bold text-basil-dark ${className}`}
    >
      {initials(name)}
    </span>
  );
}

/** The account button in the header: who's signed in, a link to account settings, and sign out. */
export default function UserMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  // Close on outside click; focus the first item when the menu opens.
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function onMenuKey(e: React.KeyboardEvent) {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      button.current?.focus();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      items[(i + step + items.length) % items.length]?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    setError(null);
    try {
      await signOut();
    } catch (err) {
      setError(toFriendlyMessage(err));
      setSigningOut(false);
    }
  }

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user.name}`}
        className="flex items-center gap-1 rounded-full p-0.5 transition-colors hover:bg-sunken sm:pr-2"
      >
        <Avatar name={user.name} />
        <ChevronDown className={`hidden h-4 w-4 text-muted transition-transform sm:block ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          ref={menu}
          role="menu"
          aria-label="Account"
          onKeyDown={onMenuKey}
          className="absolute top-full right-0 mt-2 w-[min(18rem,calc(100vw-2rem))] origin-top-right animate-menu-in rounded-card bg-surface p-1.5 shadow-[0_12px_40px_rgba(26,36,32,0.16)] ring-1 ring-line"
        >
          <div className="flex items-center gap-3 px-2.5 pt-2 pb-3">
            <Avatar name={user.name} className="h-10 w-10 text-[15px]" />
            <div className="min-w-0">
              <p className="truncate font-semibold">{user.name}</p>
              <p className="truncate text-sm text-muted" title={user.email}>
                {user.email}
              </p>
            </div>
          </div>
          <div className="border-t border-line pt-1.5">
            <a
              href="/account"
              role="menuitem"
              className="flex h-10 items-center gap-3 rounded-lg px-2.5 text-[15px] outline-none hover:bg-sunken focus-visible:bg-sunken"
            >
              <Person className="h-[18px] w-[18px] text-muted" />
              Account settings
            </a>
            <button
              role="menuitem"
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex h-10 w-full items-center gap-3 rounded-lg px-2.5 text-left text-[15px] outline-none hover:bg-sunken focus-visible:bg-sunken disabled:opacity-60"
            >
              {signingOut ? <Spinner className="h-[18px] w-[18px] text-muted" /> : <SignOut className="h-[18px] w-[18px] text-muted" />}
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
          {error && (
            <p role="alert" className="px-2.5 pt-1 pb-2 text-sm text-over">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
