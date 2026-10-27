import { Alert } from "./Icons";

/** Inline problem message: amber for "try something else", red for "that failed". */
export default function Notice({
  tone = "warn",
  children,
  action,
}: {
  tone?: "warn" | "error";
  children: React.ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  const styles = tone === "error" ? "bg-over-soft text-[#8f2a2a]" : "bg-near-soft text-[#7a5408]";
  return (
    <div role="alert" className={`flex items-start gap-2.5 rounded-card px-3.5 py-3 text-sm ${styles}`}>
      <Alert className="mt-px h-[18px] w-[18px] shrink-0" />
      <p className="min-w-0 flex-1">{children}</p>
      {action && (
        <button onClick={action.onClick} className="shrink-0 font-semibold underline-offset-2 hover:underline">
          {action.label}
        </button>
      )}
    </div>
  );
}
