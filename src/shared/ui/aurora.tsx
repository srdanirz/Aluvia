/**
 * Ambient background: three soft glows in the Apple Intelligence hues, fixed behind the page.
 * Render it once, first thing in the body. It never moves, so it costs nothing on a phone.
 */
export function Aurora() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden opacity-[var(--aurora-opacity)]"
    >
      <div className="absolute -start-[20vmax] -top-[20vmax] size-[60vmax] rounded-full bg-[var(--aurora-1)] blur-[120px]" />
      <div className="absolute -end-[15vmax] top-[10vh] size-[50vmax] rounded-full bg-[var(--aurora-2)] blur-[120px]" />
      <div className="absolute start-[25vw] -bottom-[25vmax] size-[55vmax] rounded-full bg-[var(--aurora-3)] blur-[120px]" />
    </div>
  );
}
