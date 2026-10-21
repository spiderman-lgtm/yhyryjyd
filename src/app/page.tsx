import { redirect } from 'next/navigation';
import { HomeHero } from '@/components/HomeHero';
import { HowItWorks, RecentlyChecked, ShopByStore, TopDeals, Trending } from '@/components/HomeSections';
import { currentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default function Home() {
  if (currentUser()) redirect('/dashboard');
  return (
    <div className="space-y-14">
      <HomeHero />
      <TopDeals />
      <Trending />
      <HowItWorks />
      <ShopByStore />
      <RecentlyChecked />
    </div>
  );
}
