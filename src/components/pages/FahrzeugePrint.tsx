import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import { useFirecallId } from '../../hooks/useFirecall';
import useVehicles from '../../hooks/useVehicles';
import FirecallItemCard from '../FirecallItems/FirecallItemCard';
import { formatTimestamp } from '../../common/time-format';
import { firecallItemInfo } from '../FirecallItems/infos/firecallitems';

export default function FahrzeugePrint() {
  const { isAuthorized } = useFirebaseLogin();
  const firecallId = useFirecallId();
  const { vehicles, rohre, otherItems: others } = useVehicles();
  const otherItems = [...rohre, ...others];

  if (!isAuthorized) {
    return <></>;
  }

  return (
    <Box sx={{ p: 2, m: 2 }}>
      <Typography variant="h3" gutterBottom>
        {vehicles.length} Fahrzeuge im Einsatz
      </Typography>
      <table>
        <tr>
          <th>Feuerwehr</th>
          <th>Fahrzeug</th>
          <th>Besatzung (ATS)</th>
          <th>Beschreibung</th>
          <th>Alarmierung</th>
          <th>Eintreffen</th>
          <th>abruecken</th>
          <th>GPS Position</th>
        </tr>
        {vehicles
          .sort(
            ({ fw: a = '', name: aa = '' }, { fw: b = '', name: bb = '' }) =>
              a.localeCompare(b) - aa.localeCompare(bb) / 10
          )
          .map((fzg) => (
            <tr key={fzg.id}>
              <td>{fzg.fw}</td>
              <td>{fzg.name}</td>
              <td>
                1:{fzg.besatzung || 0} ({fzg.ats})
              </td>
              <td>{fzg.beschreibung}</td>
              <td>{fzg.alarmierung && formatTimestamp(fzg.alarmierung)}</td>
              <td>{fzg.eintreffen && formatTimestamp(fzg.eintreffen)}</td>
              <td>{fzg.abruecken && formatTimestamp(fzg.abruecken)}</td>
              <td>
                {fzg.lat} {fzg.lng}
              </td>
            </tr>
          ))}
      </table>

      <Typography variant="h3" gutterBottom>
        {otherItems.length} weitere Einsatzmarker
      </Typography>
      <table>
        <tr>
          <th>Typ</th>
          <th>Name</th>
          <th>Beschreibung</th>
          <th>Datum</th>
          <th>Koordinaten</th>
        </tr>
        {otherItems.map((item) => (
          <tr key={item.id}>
            <td>{item.type}</td>
            <td>{item.name}</td>
            <td>
              {firecallItemInfo(item.type).popupFn(item)}
              {item.beschreibung && (
                <>
                  <br />
                  {item.beschreibung}
                </>
              )}
            </td>
            <td>{item.datum && formatTimestamp(item.datum)}</td>
            <td>
              {item.lat} {item.lng}
            </td>
          </tr>
        ))}
      </table>
    </Box>
  );
}