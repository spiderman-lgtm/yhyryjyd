import { redirect } from 'next/navigation';
import { HomeHero, HowItWorks, RecentlyChecked } from '@/components/HomeSections';
import { currentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default function Home() {
  if (currentUser()) redirect('/dashboard');
  return (
    <div className="space-y-14">
      <HomeHero />
      <HowItWorks />
      <RecentlyChecked />
    </div>
  );
}
