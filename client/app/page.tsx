import dynamic from 'next/dynamic';

const Map = dynamic(() => import('@/components/Map'), { ssr: true });

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-100">
      <h1 className="text-3xl font-bold mb-6 text-green-500 items-center text-center">
        EVGo!<br/>EV Charging Station Locator
      </h1>
      <Map />
    </main>
  );
}
