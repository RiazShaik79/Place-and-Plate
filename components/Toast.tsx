import { Check } from "./Icons";

export interface ToastMessage {
  id: number;
  text: string;
  action?: { label: string; onClick: () => void };
}

/** A single confirmation toast pinned to the bottom of the screen, with an optional action (e.g. Undo). */
export default function Toast({ toast, onDismiss }: { toast: ToastMessage | null; onDismiss: () => void }) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-5">
      {toast && (
        <div
          key={toast.id}
          role="status"
          className="pointer-events-auto flex max-w-md animate-toast-in items-center gap-3 rounded-full bg-ink py-2.5 pr-2.5 pl-4 text-sm text-white shadow-[0_8px_30px_rgba(26,36,32,0.25)]"
        >
          <Check className="h-4 w-4 shrink-0 text-[#8fd3ab]" />
          <span className="min-w-0">{toast.text}</span>
          {toast.action ? (
            <button
              onClick={() => {
                toast.action!.onClick();
                onDismiss();
              }}
              className="shrink-0 rounded-full px-3 py-1 font-semibold text-[#8fd3ab] hover:bg-white/10"
            >
              {toast.action.label}
            </button>
          ) : (
            <span className="w-1" />
          )}
        </div>
      )}
    </div>
  );
}
