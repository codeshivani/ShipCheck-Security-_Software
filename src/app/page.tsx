import { redirect } from 'next/navigation';
import { isSupabaseConfigured } from '@/lib/supabase/config';

export default function Home() {
  if (!isSupabaseConfigured()) redirect('/setup');
  redirect('/login');
}
