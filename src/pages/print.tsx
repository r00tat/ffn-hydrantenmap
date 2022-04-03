import dynamic from 'next/dynamic';

const DynamicMap = dynamic(
  () => {
    return import('../components/Map/PositionedMap');
  },
  { ssr: false }
);

const DynamicFahrzeuge = dynamic(
  () => {
    return import('../components/Fahrzeuge');
  },
  { ssr: false }
);

const EinsatzTagebuch = dynamic(
  () => {
    return import('../components/EinsatzTagebuch');
  },
  { ssr: false }
);

export default function PrintPage() {
  return (
    <>
      <DynamicMap />
      <DynamicFahrzeuge />
      <EinsatzTagebuch boxHeight="1200px" />
    </>
  );
}
