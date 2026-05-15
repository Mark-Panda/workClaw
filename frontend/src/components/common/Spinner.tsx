export default function Spinner({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-spin rounded-full border-2 border-gray-200 border-t-primary-600 h-5 w-5 ${className}`}
      role="status"
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
}
