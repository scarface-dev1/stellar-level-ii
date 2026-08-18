export interface Toast {
  id: number;
  kind: "success" | "error";
  message: string;
}

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast ${t.kind}`}
          onClick={() => onDismiss(t.id)}
          role="alert"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
