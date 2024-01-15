import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import { formatTimestamp } from '../../common/time-format';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import useVehicles from '../../hooks/useVehicles';
import FirecallItemCard from '../FirecallItems/FirecallItemCard';
import { downloadRowsAsCsv } from '../firebase/download';
import { Fzg } from '../firebase/firestore';
import { DownloadButton } from '../inputs/DownloadButton';

function downloadVehicles(vehicles: Fzg[]) {
  downloadRowsAsCsv(
    [
      [
        'Bezeichnung',
        'Feuerwehr',
        'Besatzung',
        'ATS',
        'Beschreibung',
        'Alarmierung',
        'Eintreffen',
        'Abrücken',
      ],
      ...vehicles.map((v) => [
        v.name,
        v.fw,
        v.besatzung ? Number.parseInt(v.besatzung, 10) + 1 : 1,
        v.ats,
        v.beschreibung,
        v.alarmierung ? formatTimestamp(v.alarmierung) : '',
        v.eintreffen ? formatTimestamp(v.eintreffen) : '',
        v.abruecken ? formatTimestamp(v.abruecken) : '',
      ]),
    ],
    'Fahrzeuge.csv'
  );
}

export default function Fahrzeuge() {
  const { isAuthorized } = useFirebaseLogin();
  const { vehicles, rohre, otherItems } = useVehicles();

  if (!isAuthorized) {
    return <></>;
  }

  return (
    <Box sx={{ p: 2, m: 2 }}>
      <Typography variant="h3" gutterBottom>
        {vehicles.length} Fahrzeuge im Einsatz{' '}
        <DownloadButton
          tooltip="Fahrzeuge als CSV herunterladen"
          onClick={() => downloadVehicles(vehicles)}
        />
      </Typography>
      <Grid container spacing={2}>
        {vehicles.map((fzg) => (
          <FirecallItemCard item={fzg} key={fzg.id} />
        ))}
      </Grid>
      <Typography variant="h3" gutterBottom>
        {rohre.length} Rohre im Einsatz
      </Typography>
      <Grid container spacing={2}>
        {rohre.map((rohr) => (
          <FirecallItemCard item={rohr} key={rohr.id} />
        ))}
      </Grid>
      <Typography variant="h3" gutterBottom>
        {otherItems.length} weitere Einsatzmarker
      </Typography>
      <Grid container spacing={2}>
        {otherItems.map((item) => (
          <FirecallItemCard item={item} key={item.id} />
        ))}
      </Grid>
    </Box>
  );
}
