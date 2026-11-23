import DescriptionIcon from '@mui/icons-material/Description';
import Button from '@mui/material/Button';
import L from 'leaflet';
import { useTranslations } from 'next-intl';
import { ReactNode, useState } from 'react';
import { Marker, Popup } from 'react-leaflet';
import { RisikoObjekt } from '../../../common/gis-objects';
import { PopupNavigateButton } from '../../FirecallItems/elements/FirecallItemBase';
import ObjektplanDialog from '../../Objektplan/ObjektplanDialog';

export interface RisikoObjektMarkerProps {
  risikoobjekt: RisikoObjekt;
  children?: ReactNode;
}

export const risikoObjektIcon = L.icon({
  iconUrl: '/icons/risiko.svg',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, 0],
});

export default function RisikoObjektMarker({
  risikoobjekt: r,
  children,
}: RisikoObjektMarkerProps) {
  const t = useTranslations('objektplan');
  const [plansOpen, setPlansOpen] = useState(false);

  return (
    <Marker
      position={[r.lat, r.lng]}
      title={r.name}
      key={r.id}
      icon={risikoObjektIcon}
    >
      <Popup>
        <PopupNavigateButton lat={r.lat} lng={r.lng} />
        <b>
          {r.ortschaft} {r.name}
        </b>
        <br />
        {r.risikogruppe}
        <br />
        {r.adresse}
        {r.description && (
          <>
            <br />
            {r.description}
          </>
        )}
        {r.link && (
          <>
            <br />
            <a href={r.link} target="_blank" rel="noreferrer">
              {t('legacyLink')}
            </a>
          </>
        )}
        {r.id && (
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
      {r.id && plansOpen && (
        <ObjektplanDialog open onClose={() => setPlansOpen(false)} objekt={r} />
      )}
      {children}
    </Marker>
  );
}
