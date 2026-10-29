/** Shown when the browser build lacks VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. */
export function SetupRequiredPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="max-w-lg rounded-xl border border-border bg-surface p-6 shadow-raised">
        <h1 className="text-lg font-semibold text-ink">Configuration required</h1>
        <p className="mt-2 text-sm text-ink-muted">
          The application can&apos;t connect to the authentication service because its public
          settings are missing. Set <code className="font-mono">VITE_SUPABASE_URL</code> and{' '}
          <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> in the environment file, then
          restart the development server or rebuild the application. See the README for setup
          steps.
        </p>
      </div>
    </div>
  );
}
