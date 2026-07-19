export type ToastKind = "success" | "error" | "info";

export const TOAST_EVENT = "wc-toast";

export interface ToastDetail {
  message: string;
  kind: ToastKind;
}

/**
 * Fire a toast from anywhere — a component, a store, a callback — without
 * threading context through the tree. The mounted <Toaster/> listens for this
 * window event and renders it. No-op on the server.
 */
export function notify(message: string, kind: ToastKind = "info") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ToastDetail>(TOAST_EVENT, { detail: { message, kind } })
  );
}
