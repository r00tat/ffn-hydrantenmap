import DescriptionIcon from '@mui/icons-material/Description';
import Button from '@mui/material/Button';
import L from 'leaflet';
import { useTranslations } from 'next-intl';
import { ReactNode, useState } from 'react';
import { Marker, Popup } from 'react-leaflet';
import { GefahrObjekt } from '../../../common/gis-objects';
import { PopupNavigateButton } from '../../FirecallItems/elements/FirecallItemBase';
import ObjektplanDialog from '../../Objektplan/ObjektplanDialog';

export interface GefahrObjektMarkerProps {
  objekt: GefahrObjekt;
  children?: ReactNode;
}

export const gefahrObjektIcon = L.icon({
  iconUrl: '/icons/gefahr.svg',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, 0],
});

/** Gefährdetes Objekt — mit Plänen wie ein Risikoobjekt (docs/objektplaene.md). */
export default function GefahrObjektMarker({
  objekt: o,
  children,
}: GefahrObjektMarkerProps) {
  const t = useTranslations('objektplan');
  const [plansOpen, setPlansOpen] = useState(false);

  return (
    <Marker
      position={[o.lat, o.lng]}
      title={o.name}
      key={o.id}
      icon={gefahrObjektIcon}
    >
      <Popup>
        <PopupNavigateButton lat={o.lat} lng={o.lng} />
        <b>
          {o.ortschaft} {o.name}
        </b>
        <br />
        {o.adresse}
        {o.description && (
          <>
            <br />
            {o.description}
          </>
        )}
        {o.link && (
          <>
            <br />
            <a href={o.link} target="_blank" rel="noreferrer">
              {t('legacyLink')}
            </a>
          </>
        )}
        {o.id && (
          <>
            <br />
            <Button
              size="small"
              variant="contained"
              startIcon={<DescriptionIcon />}
              onClick={() => setPlansOpen(true)}
              sx={{ mt: 1 }}
            >
              {t('openPlans')}
            </Button>
          </>
        )}
      </Popup>
      {/* Außerhalb des Popups: schließt Leaflet das Popup, bleibt der Dialog offen. */}
      {o.id && plansOpen && (
        <ObjektplanDialog
          open
          onClose={() => setPlansOpen(false)}
          objekt={{ ...o, art: 'gefahrobjekt' }}
        />
      )}
      {children}
    </Marker>
  );
}
