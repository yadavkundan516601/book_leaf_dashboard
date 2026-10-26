export function Spinner({ label = "Loading…", fullPage = false }: { label?: string; fullPage?: boolean }) {
  return (
    <div className={fullPage ? "spinner-wrap spinner-wrap--page" : "spinner-wrap"} role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
