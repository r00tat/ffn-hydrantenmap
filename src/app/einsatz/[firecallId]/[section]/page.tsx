import { notFound } from 'next/navigation';
import type { ComponentType } from 'react';

const SECTIONS: Record<
  string,
  () => Promise<{ default: ComponentType }>
> = {
  ebenen: () => import('../../../../components/pages/LayersWrapper'),
  tagebuch: () =>
    import('../../../../components/pages/EinsatzTagebuchWrapper'),
  einsatzmittel: () => import('../../../../components/pages/DynamicFahrzeuge'),
  geschaeftsbuch: () =>
    import('../../../../components/pages/GeschaeftsbuchWrapper'),
  einsatzorte: () => import('../../../../components/pages/EinsatzorteWrapper'),
  chat: () => import('../../../../components/pages/Chat'),
  print: () => import('../../../../components/pages/PrintWrapper'),
  details: () => import('../../../../components/pages/EinsatzDetails'),
};

export default async function EinsatzSectionPage({
  params,
}: {
  params: Promise<{ firecallId: string; section: string }>;
}) {
  const { section } = await params;

  const loader = SECTIONS[section];
  if (!loader) {
    notFound();
  }

  const { default: SectionComponent } = await loader();
  return <SectionComponent />;
}
