/** Shared transport-error copy for client actions. */
export function requestFailureMessage() {
  return typeof document !== "undefined" && document.documentElement.lang.startsWith("ar")
    ? "تعذر إكمال الطلب. تحقق من الاتصال وحاول مرة أخرى."
    : "Could not complete the request. Check your connection and try again.";
}
