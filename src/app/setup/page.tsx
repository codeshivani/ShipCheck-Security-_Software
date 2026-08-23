import { getSupabaseConfigError } from '@/lib/supabase/config';

export const dynamic = 'force-dynamic';

export default function SetupPage() {
  const error = getSupabaseConfigError();

  return (
    <main className="min-h-screen grid place-items-center bg-[#070b10] px-4 py-10 text-slate-100">
      <section className="w-full max-w-2xl rounded-3xl border border-white/10 bg-white p-8 text-slate-900 shadow-2xl sm:p-10">
        <div className="text-3xl font-black tracking-tight">SHIP<span className="text-emerald-600">CHECK</span></div>
        <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-semibold text-amber-900">Supabase setup required</p>
          <p className="mt-2 text-sm text-amber-800">{error}</p>
        </div>

        <h1 className="mt-8 text-2xl font-bold">Configure your local environment</h1>
        <ol className="mt-4 space-y-4 text-sm leading-6 text-slate-600">
          <li><strong>1.</strong> In the project root, create <code className="rounded bg-slate-100 px-1.5 py-0.5">.env.local</code>.</li>
          <li><strong>2.</strong> Copy the values from <strong>Supabase → Settings → API</strong>.</li>
          <li><strong>3.</strong> Add the two public variables below. Do not use the service-role key here.</li>
        </ol>

        <pre className="mt-5 overflow-x-auto rounded-2xl bg-slate-950 p-5 text-sm leading-6 text-slate-100">{`NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY`}</pre>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
          <p className="font-semibold text-slate-800">Then restart the dev server</p>
          <pre className="mt-2 overflow-x-auto text-xs">{`Ctrl+C\nnpm run dev`}</pre>
        </div>

        <p className="mt-6 text-xs leading-5 text-slate-500">
          Your <code>.env.local</code> is ignored by Git, so local credentials are not committed to the repository.
        </p>
      </section>
    </main>
  );
}
