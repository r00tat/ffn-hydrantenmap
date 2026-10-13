'use client';

import { useTranslations } from 'next-intl';
import useFirecall, { useFirecallId } from '../../../../../hooks/useFirecall';
import KostenersatzAccess from '../../../../../components/Kostenersatz/KostenersatzAccess';
import KostenersatzCalculationPage from '../../../../../components/Kostenersatz/KostenersatzCalculationPage';

export default function KostenersatzNeuPage() {
  const t = useTranslations('kostenersatz');
  const firecall = useFirecall();
  const firecallId = useFirecallId();

  return (
    <KostenersatzAccess firecall={firecall} firecallId={firecallId} title={t('title')}>
      <KostenersatzCalculationPage firecall={firecall} firecallId={firecallId} />
    </KostenersatzAccess>
  );
}
