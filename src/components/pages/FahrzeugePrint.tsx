import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { formatTimestamp } from '../../common/time-format';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import useVehicles from '../../hooks/useVehicles';
import { firecallItemInfo } from '../FirecallItems/infos/firecallitems';

export default function FahrzeugePrint() {
  const { isAuthorized } = useFirebaseLogin();
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
        <thead>
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
        </thead>
        <tbody>
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
        </tbody>
      </table>

      <Typography variant="h3" gutterBottom>
        {otherItems.length} weitere Einsatzmarker
      </Typography>
      <table>
        <thead>
          <tr>
            <th>Typ</th>
            <th>Name</th>
            <th>Beschreibung</th>
            <th>Datum</th>
            <th>Koordinaten</th>
          </tr>
        </thead>
        <tbody>
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
        </tbody>
      </table>
    </Box>
  );
}
