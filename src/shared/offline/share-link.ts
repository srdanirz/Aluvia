/**
 * Shares a link with the phone's own sheet (WhatsApp, Instagram), or copies it where there is no
 * share sheet. Resolves to what happened so the button can say so.
 */
export async function shareLink(url: string, title: string): Promise<"shared" | "copied" | "failed"> {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ url, title });
      return "shared";
    } catch (error) {
      // Closing the sheet is a choice, not a failure.
      if (error instanceof DOMException && error.name === "AbortError") return "shared";
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
