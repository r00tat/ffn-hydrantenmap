'use client';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

export default function About() {
  return (
    <Paper sx={{ p: 2, m: 2 }}>
      <Typography variant="h3" gutterBottom>
        About
      </Typography>
      <Typography>
        Diese Webseite zeigt Hydranten im Raum Neusiedl am See an, um diese im
        Einsatzfall einfach zu lokalisieren.
      </Typography>
      <Typography variant="h4" gutterBottom>
        Impressum
      </Typography>
      <Typography variant="h5">
        <b>Für den Inhalt verantwortlich</b>
      </Typography>
      <Typography>
        Feuerwehr Neusiedl am See
        <br />
        A-7100 Neusiedl am See, Satzgasse 9<br />
        Tel: +43 (0) 2167 / 2250
        <br />
        Fax:+43 (0) 2167 / 2250 4<br />
        email: verwaltung [at] ff-neusiedlamsee [dot] at
        <br />
        <a
          href="http://www.ff-neusiedlamsee.at/"
          target="_blank"
          rel="noopener noreferrer"
        >
          http://www.ff-neusiedlamsee.at/
        </a>
      </Typography>
      <Typography variant="h5">Urheberrechte</Typography>
      <Typography>
        Texte, Bilder und Grafiken unterliegen dem Schutz des Urheberrechts und
        anderen Schutzgesetzen, soweit nicht anders angegeben.
        <br />
      </Typography>
      <Typography variant="h5">Haftung</Typography>
      <Typography>
        Trotz sorgfältiger inhaltlicher Kontrolle übernehmen wir keine Haftung
        für die Inhalte externer Links. Für den Inhalt der verlinkten Seiten
        sind ausschließlich deren Betreiber verantwortlich.
      </Typography>

      <Typography variant="h5">Version</Typography>
      <Typography>Build id: {process.env.NEXT_PUBLIC_BUILD_ID}</Typography>
    </Paper>
  );
}
