"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ADDRESS_FIELD_MAX } from "@/lib/account";
import { apiFetch, readFieldError, toFriendlyMessage } from "@/lib/client";
import type { Address } from "@/lib/types";
import { SubmitButton, TextField } from "./FormField";
import { Search } from "./Icons";
import Notice from "./Notice";
import { SavedNote, Section, useFlash } from "./SettingsSection";
import Spinner from "./Spinner";

type Field = keyof Address;
const FIELDS: Field[] = ["line1", "line2", "city", "region", "postalCode", "country"];
const EMPTY: Address = { line1: "", line2: "", city: "", region: "", postalCode: "", country: "" };

interface Suggestion {
  placeId: string;
  main: string;
  secondary: string;
}

/**
 * Postal address. With Google Places configured (GOOGLE_MAPS_API_KEY on the server), a search
 * box fills the fields; the fields stay editable either way, and nothing saves until "Save address".
 */
export default function AddressSection({ address, placesEnabled }: { address: Address | null; placesEnabled: boolean }) {
  const [saved, setSaved] = useState<Address | null>(address);
  const [values, setValues] = useState<Address>(address ?? EMPTY);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);
  const [flash, showFlash, clearFlash] = useFlash();
  const [searchAvailable, setSearchAvailable] = useState(placesEnabled);
  const [filledFromSearch, setFilledFromSearch] = useState(false);
  const line1 = useRef<HTMLInputElement>(null);

  const dirty = FIELDS.some((f) => values[f].trim() !== (saved?.[f] ?? ""));

  const set = (f: Field) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [f]: e.target.value }));
    setErrors((p) => ({ ...p, [f]: undefined }));
  };

  function fill(a: Address) {
    setValues(a);
    setErrors({});
    setFilledFromSearch(true);
    clearFlash();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !dirty) return;
    clearFlash();
    setFormError(null);
    const found: Partial<Record<Field, string>> = {};
    if (!values.line1.trim()) found.line1 = "Enter the street address.";
    if (!values.city.trim()) found.city = "Enter the town or city.";
    if (!values.country.trim()) found.country = "Enter the country.";
    if (Object.keys(found).length > 0) {
      setErrors(found);
      document.getElementById(`address-${FIELDS.find((f) => found[f])}`)?.focus();
      return;
    }
    await send({ address: values }, "save");
  }

  async function send(body: { address: Address | null }, kind: "save" | "remove") {
    setBusy(kind);
    try {
      const res = await apiFetch("/api/account/address", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const { message, field } = await readFieldError(res);
        if (FIELDS.includes(field as Field)) setErrors({ [field as Field]: message });
        else setFormError(message);
        return;
      }
      const { user } = (await res.json()) as { user: { address: Address | null } };
      setSaved(user.address);
      setValues(user.address ?? EMPTY);
      setFilledFromSearch(false);
      showFlash(kind === "save" ? "Address saved" : "Address removed");
    } catch (err) {
      setFormError(err instanceof TypeError ? "Couldn't reach the app. Check that it's still running, then try again." : toFriendlyMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section title="Address" description="Where you live. Only you can see it.">
      <form onSubmit={save} noValidate className="space-y-5">
        {searchAvailable && <AddressSearch onPick={fill} onUnavailable={() => setSearchAvailable(false)} />}
        {filledFromSearch && (
          <p role="status" className="text-sm text-muted">
            Filled in from your search. Check the details, then save.
          </p>
        )}
        <TextField
          ref={line1}
          id="address-line1"
          label="Street address"
          autoComplete="address-line1"
          maxLength={ADDRESS_FIELD_MAX}
          value={values.line1}
          onChange={set("line1")}
          error={errors.line1}
        />
        <TextField
          id="address-line2"
          label="Apartment, suite or building (optional)"
          autoComplete="address-line2"
          maxLength={ADDRESS_FIELD_MAX}
          value={values.line2}
          onChange={set("line2")}
          error={errors.line2}
        />
        <div className="grid items-start gap-5 sm:grid-cols-2">
          <TextField id="address-city" label="Town or city" autoComplete="address-level2" maxLength={ADDRESS_FIELD_MAX} value={values.city} onChange={set("city")} error={errors.city} />
          <TextField id="address-region" label="Region (optional)" placeholder="State, county or province" autoComplete="address-level1" maxLength={ADDRESS_FIELD_MAX} value={values.region} onChange={set("region")} error={errors.region} />
          <TextField id="address-postalCode" label="Postcode (optional)" placeholder="Postcode or ZIP" autoComplete="postal-code" maxLength={ADDRESS_FIELD_MAX} value={values.postalCode} onChange={set("postalCode")} error={errors.postalCode} />
          <TextField id="address-country" label="Country" autoComplete="country-name" maxLength={ADDRESS_FIELD_MAX} value={values.country} onChange={set("country")} error={errors.country} />
        </div>

        {formError && <Notice tone="error">{formError}</Notice>}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <SubmitButton busy={busy === "save"} disabled={!dirty || busy !== null}>
            {busy === "save" ? "Saving…" : "Save address"}
          </SubmitButton>
          {saved && (
            <button
              type="button"
              onClick={() => send({ address: null }, "remove")}
              disabled={busy !== null}
              className="inline-flex h-11 items-center gap-2 rounded-full px-4 text-[15px] font-semibold text-muted transition-colors hover:bg-over-soft hover:text-over disabled:opacity-60"
            >
              {busy === "remove" && <Spinner className="h-4 w-4" />}
              Remove address
            </button>
          )}
          {flash && <SavedNote text={flash} />}
        </div>
      </form>
    </Section>
  );
}

/** Google Places search as an accessible combobox. Only rendered when the server has a key. */
function AddressSearch({ onPick, onUnavailable }: { onPick: (a: Address) => void; onUnavailable: () => void }) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = useRef<string | null>(null);
  const listId = useId();
  // Kept in a ref so a parent re-render (typing in other fields) doesn't re-run the lookup.
  const unavailable = useRef(onUnavailable);
  unavailable.current = onUnavailable;

  // Debounced lookups; one session token per search, closed by picking a result.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      session.current ??= crypto.randomUUID();
      setLoading(true);
      try {
        const res = await apiFetch("/api/places/autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: q, sessionToken: session.current }),
          signal: controller.signal,
        });
        if (res.status === 503) return unavailable.current();
        if (!res.ok) {
          setError(res.status === 429 ? "Address search is busy. Try again in a moment, or type the address below." : "Address search isn't working right now. Type the address below instead.");
          setSuggestions([]);
          return;
        }
        const data = (await res.json()) as { suggestions: Suggestion[] };
        setError(null);
        setSuggestions(data.suggestions);
        setActive(-1);
        setOpen(true);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setError("Couldn't reach address search. Type the address below instead.");
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  async function pick(s: Suggestion) {
    setOpen(false);
    setQuery(`${s.main}${s.secondary ? `, ${s.secondary}` : ""}`);
    setLoading(true);
    try {
      const res = await apiFetch(`/api/places/details?placeId=${encodeURIComponent(s.placeId)}&sessionToken=${encodeURIComponent(session.current ?? "")}`);
      if (!res.ok) throw new Error();
      const { address } = (await res.json()) as { address: Address };
      onPick(address);
      setError(null);
    } catch {
      setError("Couldn't load that address. Type it below instead.");
    } finally {
      session.current = null;
      setLoading(false);
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(suggestions[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showList = open && query.trim().length >= 3;

  return (
    <div>
      <label htmlFor="address-search" className="mb-1.5 block text-sm font-semibold">
        Find your address
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 h-[18px] w-[18px] -translate-y-1/2 text-faint" />
        <input
          id="address-search"
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          placeholder="Start typing your street address"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKey}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className="h-11 w-full rounded-full border border-line bg-sunken pr-10 pl-10 text-[15px] outline-none transition-colors placeholder:text-faint focus:border-basil focus:bg-surface focus:ring-2 focus:ring-basil/20"
        />
        {loading && <Spinner className="absolute top-1/2 right-3.5 h-4 w-4 -translate-y-1/2 text-basil" />}
        {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Address suggestions"
          className="absolute inset-x-0 top-full z-10 mt-1.5 overflow-hidden rounded-card bg-surface p-1 shadow-[0_12px_40px_rgba(26,36,32,0.16)] ring-1 ring-line"
        >
          {suggestions.length === 0 && !loading ? (
            <li className="px-3 py-2.5 text-sm text-muted">No matches. Type the address below instead.</li>
          ) : (
            suggestions.map((s, i) => (
              <li
                key={s.placeId}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                className={`cursor-pointer rounded-lg px-3 py-2.5 ${i === active ? "bg-sunken" : "hover:bg-sunken"}`}
              >
                <span className="block font-semibold">{s.main}</span>
                {s.secondary && <span className="block text-sm text-muted">{s.secondary}</span>}
              </li>
            ))
          )}
        </ul>
        )}
      </div>
      {error ? (
        <p className="mt-1.5 text-sm text-over">{error}</p>
      ) : (
        <p className="mt-1.5 text-sm text-muted">Pick a match to fill in the fields below, or type them yourself.</p>
      )}
    </div>
  );
}
