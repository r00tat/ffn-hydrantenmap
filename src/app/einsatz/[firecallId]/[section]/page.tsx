import { notFound } from 'next/navigation';
import type { ComponentType } from 'react';
import type { FirecallSectionName } from '../../../../common/appShellRoutes';

// Die Schlüssel sind an `FIRECALL_SECTION_NAMES` gebunden: Ein Abschnitt, der
// dort fehlt, würde offline nicht vorgehalten (siehe appShellRoutes.ts).
const SECTIONS: Record<
  FirecallSectionName,
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
  sybos: () => import('../../../../components/pages/SybosWrapper'),
  details: () => import('../../../../components/pages/EinsatzDetails'),
  fahrtenbuch: () =>
    import('../../../../components/Fahrtenbuch/EinsatzFahrtenbuchSection'),
  loeschwasserversorgung: () =>
    import('../../../../components/pages/LoeschwasserversorgungWrapper'),
  dammbau: () => import('../../../../components/pages/DammbauWrapper'),
  hochwasser: () => import('../../../../components/pages/HochwasserWrapper'),
  atemschutz: () => import('../../../../components/pages/AtemschutzWrapper'),
  atemschutzueberwachung: () =>
    import('../../../../components/pages/UeberwachungWrapper'),
};

export default async function EinsatzSectionPage({
  params,
}: {
  params: Promise<{ firecallId: string; section: string }>;
}) {
  const { section } = await params;

  if (!Object.hasOwn(SECTIONS, section)) {
    notFound();
  }

  const loader = SECTIONS[section as FirecallSectionName];
  const { default: SectionComponent } = await loader();
  return <SectionComponent />;
}
