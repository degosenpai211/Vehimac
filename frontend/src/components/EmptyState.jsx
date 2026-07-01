export default function EmptyState({ message, action }) {
  return (
    <div className="text-center py-12 text-slate-500">
      <p className="mb-4">{message}</p>
      {action}
    </div>
  )
}
