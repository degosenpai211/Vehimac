export default function SubmitButton({
  isLoading,
  idleLabel,
  loadingLabel,
  disabled = false,
}) {
  return (
    <button type="submit" className="button button--primary" disabled={isLoading || disabled}>
      {isLoading && <span className="button__spinner" aria-hidden="true" />}
      {isLoading ? loadingLabel : idleLabel}
    </button>
  )
}
