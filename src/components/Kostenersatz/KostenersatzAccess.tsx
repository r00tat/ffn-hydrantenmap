'use client';

import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useCan } from '../../hooks/usePermissions';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import type { Firecall } from '../firebase/firestore';

export interface KostenersatzAccessProps {
  firecall: Pick<Firecall, 'group'>;
  firecallId: string;
  /** Überschrift der Hinweise, wenn der Inhalt nicht gezeigt wird. */
  title: string;
  children: ReactNode;
}

/**
 * Gemeinsame Schranke der Kostenersatz-Seiten: angemeldet, ein Einsatz gewählt
 * und die Rolle „Kostenersatz" in der Gruppe dieses Einsatzes.
 *
 * Der Einsatz kommt vor der Berechtigung, weil das Recht an seiner Gruppe hängt
 * — ohne Einsatz gibt es nichts zu prüfen. Die Grenze ziehen Firestore-Regeln
 * und Server Actions; hier geht es nur um die Oberfläche.
 */
export default function KostenersatzAccess({
  firecall,
  firecallId,
  title,
  children,
}: KostenersatzAccessProps) {
  const t = useTranslations('kostenersatz');
  const { isAuthorized } = useFirebaseLogin();
  const permitted = useCan(firecall.group, 'kostenersatz.use');

  const notice = (text: string, withTitle = true) => (
    <Container maxWidth="md" sx={{ py: 4 }}>
      {withTitle && (
        <Typography variant="h5" gutterBottom>
          {title}
        </Typography>
      )}
      <Typography>{text}</Typography>
    </Container>
  );

  if (!isAuthorized) return notice(t('loginRequired'), false);
  if (firecallId === 'unknown') return notice(t('noFirecall'));
  if (!permitted) return notice(t('noPermission'));
  return <>{children}</>;
}
