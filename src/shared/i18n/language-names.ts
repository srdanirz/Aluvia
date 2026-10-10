/** Language names in the viewer's language ("inglés", "English"), from Intl; no list to maintain. */
export function languageNames(viewerLocale: string): (code: string) => string {
  const names = new Intl.DisplayNames([viewerLocale], { type: "language" });
  return (code) => names.of(code) ?? code;
}
