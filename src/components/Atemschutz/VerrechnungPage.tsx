'use client';

import SettingsIcon from '@mui/icons-material/Settings';
import Alert from '@mui/material/Alert';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Container from '@mui/material/Container';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  FUELLUNG_TARIF_IDS,
  empfaengerFuerFeuerwehr,
  fuellungenNachFeuerwehr,
  offeneFuellungen,
  rechnungConfigLuecken,
  rechnungStatusFarbe,
  type AtemschutzEmpfaenger,
  type FeuerwehrBuendel,
} from '../../common/atemschutzRechnung';
import { KOSTENERSATZ_GROUP, formatCurrency } from '../../common/kostenersatz';
import useAtemschutzEmpfaenger from '../../hooks/useAtemschutzEmpfaenger';
import useAtemschutzFuellungen from '../../hooks/useAtemschutzFuellungen';
import useAtemschutzGeraete from '../../hooks/useAtemschutzGeraete';
import useAtemschutzRechnungConfig from '../../hooks/useAtemschutzRechnungConfig';
import useAtemschutzRechnungen from '../../hooks/useAtemschutzRechnungen';
import useFahrtenbuchGroup from '../../hooks/useFahrtenbuchGroup';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import useGroupFeuerwehrName from '../../hooks/useGroupFeuerwehrName';
import { useKostenersatzRates } from '../../hooks/useKostenersatz';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import EmpfaengerDialog from './EmpfaengerDialog';
import RechnungDialog from './RechnungDialog';
import { deleteAtemschutzEmpfaenger } from './rechnungActions';

/**
 * Statuslabel als feste Abbildung: Ein aus dem Status zusammengesetzter
 * Schlüssel scheitert an der `NamespacedMessageKeys`-Typisierung von
 * next-intl.
 */
const STATUS_LABEL = {
  draft: 'rechnung.status.draft',
  sent: 'rechnung.status.sent',
  paid: 'rechnung.status.paid',
  cancelled: 'rechnung.status.cancelled',
} as const;

/** Wie STATUS_LABEL: fester Schlüssel, sonst greift die next-intl-Typisierung. */
const LUECKE_LABEL: Record<string, 'rechnung.absenderName' | 'rechnung.absenderAdresse' | 'rechnung.iban'> = {
  absenderName: 'rechnung.absenderName',
  absenderAdresse: 'rechnung.absenderAdresse',
  iban: 'rechnung.iban',
};

export default function VerrechnungPage() {
  const t = useTranslations('atemschutz');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const router = useRouter();
  const { isAuthorized, groups: freigaben } = useFirebaseLogin();
  const { groups, groupId, setGroupId } = useFahrtenbuchGroup();

  const { fuellungen } = useAtemschutzFuellungen(groupId, {
    nurVerrechnen: true,
  });
  const rechnungen = useAtemschutzRechnungen(groupId);
  const empfaenger = useAtemschutzEmpfaenger(groupId);
  const config = useAtemschutzRechnungConfig(groupId);
  const { geraeteById, feuerwehren } = useAtemschutzGeraete(groupId);
  const feuerwehrName = useGroupFeuerwehrName(groupId);
  const { rates } = useKostenersatzRates();

  const [buendelOffen, setBuendelOffen] = useState<FeuerwehrBuendel>();
  const [empfaengerOffen, setEmpfaengerOffen] = useState(false);
  const [empfaengerEdit, setEmpfaengerEdit] = useState<AtemschutzEmpfaenger>();
  const [loeschKandidat, setLoeschKandidat] = useState<AtemschutzEmpfaenger>();

  const preise = useMemo(() => {
    const map: Record<string, number> = {};
    for (const rate of rates) {
      if (FUELLUNG_TARIF_IDS.includes(rate.id)) map[rate.id] = rate.price;
    }
    return map;
  }, [rates]);

  const volumen = useMemo(() => {
    const map: Record<string, number> = {};
    for (const [id, geraet] of geraeteById) {
      if (typeof geraet.volumenLiter === 'number') {
        map[id] = geraet.volumenLiter;
      }
    }
    return map;
  }, [geraeteById]);

  // Ohne Absender und Bankverbindung ist die Rechnung ein Zettel: Der
  // Empfänger weiß weder von wem sie kommt noch wohin er überweisen soll.
  const luecken = useMemo(
    () => rechnungConfigLuecken(config, feuerwehrName),
    [config, feuerwehrName],
  );

  const buendel = useMemo(
    () =>
      Object.keys(preise).length
        ? fuellungenNachFeuerwehr(
            offeneFuellungen(fuellungen),
            preise,
            config.vorgabeTarif,
          )
        : [],
    [fuellungen, preise, config.vorgabeTarif],
  );

  if (!isAuthorized) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography>{t('rechnung.loginRequired')}</Typography>
      </Container>
    );
  }

  // Wer abrechnet, braucht die Kostenersatz-Freigabe — dieselbe Bedingung wie
  // in `actionFuellungRechnungRequired` und in den Firestore-Regeln.
  if (!freigaben?.includes(KOSTENERSATZ_GROUP)) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography variant="h5" gutterBottom>
          {t('rechnung.title')}
        </Typography>
        <Typography>{t('rechnung.noPermission')}</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Typography variant="h4" gutterBottom>
        {t('rechnung.title')}
      </Typography>

      <Stack
        direction="row"
        spacing={2}
        sx={{ mb: 2, flexWrap: 'wrap', alignItems: 'center' }}
      >
        {groups.length > 1 && (
          <TextField
            select
            size="small"
            label={t('fuellprotokoll.group')}
            value={groupId ?? ''}
            onChange={(e) => setGroupId(e.target.value)}
            sx={{ minWidth: 180 }}
          >
            {groups.map((g) => (
              <MenuItem key={g.id} value={g.id}>
                {g.name}
              </MenuItem>
            ))}
          </TextField>
        )}
        <Button onClick={() => setEmpfaengerOffen(true)}>
          {t('rechnung.empfaengerNeu')}
        </Button>
      </Stack>

      {luecken.length > 0 && (
        <Alert
          severity="warning"
          sx={{ mb: 3 }}
          action={
            <Button
              component={Link}
              href="/admin/atemschutz"
              size="small"
              startIcon={<SettingsIcon />}
            >
              {t('rechnung.zuDenEinstellungen')}
            </Button>
          }
        >
          {t('rechnung.configUnvollstaendig', {
            felder: luecken.map((f) => t(LUECKE_LABEL[f])).join(', '),
          })}
        </Alert>
      )}

      <Typography variant="h6" gutterBottom>
        {t('rechnung.offene')}
      </Typography>
      {buendel.length === 0 ? (
        <Typography sx={{ mb: 3 }}>{t('rechnung.keineOffenen')}</Typography>
      ) : (
        <Table size="small" sx={{ mb: 4 }}>
          <TableHead>
            <TableRow>
              <TableCell>{t('rechnung.spalteFeuerwehr')}</TableCell>
              <TableCell align="right">
                {t('rechnung.spalteFlaschen')}
              </TableCell>
              <TableCell>{t('rechnung.spalteZeitraum')}</TableCell>
              <TableCell align="right">{t('rechnung.spalteSumme')}</TableCell>
              <TableCell>{t('rechnung.spalteEmpfaenger')}</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {buendel.map((b) => (
              <TableRow key={b.feuerwehr || '__ohne__'}>
                <TableCell>
                  {b.feuerwehr || t('rechnung.ohneFeuerwehr')}
                </TableCell>
                <TableCell align="right">{b.flaschen}</TableCell>
                <TableCell>
                  {format.dateTime(new Date(b.von), { dateStyle: 'short' })} –{' '}
                  {format.dateTime(new Date(b.bis), { dateStyle: 'short' })}
                </TableCell>
                <TableCell align="right">{formatCurrency(b.summe)}</TableCell>
                <TableCell>
                  {empfaengerFuerFeuerwehr(empfaenger, b.feuerwehr)?.name ?? (
                    <Chip
                      size="small"
                      color="warning"
                      label={t('rechnung.keinEmpfaenger')}
                    />
                  )}
                </TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => setBuendelOffen(b)}>
                    {t('rechnung.create')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Typography variant="h6" gutterBottom>
        {t('rechnung.rechnungen')}
      </Typography>
      {rechnungen.length === 0 ? (
        <Typography>{t('rechnung.keineRechnungen')}</Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('rechnung.spalteNummer')}</TableCell>
              <TableCell>{t('rechnung.spalteEmpfaenger')}</TableCell>
              <TableCell>{t('rechnung.spalteDatum')}</TableCell>
              <TableCell align="right">{t('rechnung.spalteSumme')}</TableCell>
              <TableCell>{t('rechnung.spalteStatus')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rechnungen.map((rechnung) => (
              <TableRow key={rechnung.id} hover>
                <TableCell>
                  <Link href={`/atemschutz/verrechnung/${rechnung.id}`}>
                    {rechnung.nummer}
                  </Link>
                </TableCell>
                <TableCell>{rechnung.empfaenger.name}</TableCell>
                <TableCell>
                  {format.dateTime(new Date(rechnung.datum), {
                    dateStyle: 'short',
                  })}
                </TableCell>
                <TableCell align="right">
                  {formatCurrency(rechnung.summe)}
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    color={rechnungStatusFarbe(rechnung.status)}
                    label={t(STATUS_LABEL[rechnung.status])}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Typography variant="h6" gutterBottom sx={{ mt: 4 }}>
        {t('empfaenger.title')}
      </Typography>
      {empfaenger.length === 0 ? (
        <Typography>{t('empfaenger.keine')}</Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('empfaenger.name')}</TableCell>
              <TableCell>{t('empfaenger.feuerwehrKurz')}</TableCell>
              <TableCell>{t('empfaenger.email')}</TableCell>
              <TableCell>{t('empfaenger.active')}</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {empfaenger.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{e.name}</TableCell>
                <TableCell>{e.feuerwehr}</TableCell>
                <TableCell>{e.email}</TableCell>
                <TableCell>
                  {e.active ? t('empfaenger.ja') : t('empfaenger.nein')}
                </TableCell>
                <TableCell align="right">
                  <Tooltip title={t('empfaenger.edit')}>
                    <IconButton
                      size="small"
                      onClick={() => setEmpfaengerEdit(e)}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('empfaenger.delete')}>
                    <IconButton size="small" onClick={() => setLoeschKandidat(e)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {buendelOffen && groupId && (
        <RechnungDialog
          open
          groupId={groupId}
          buendel={buendelOffen}
          empfaenger={empfaenger}
          preise={preise}
          vorgabeTarif={config.vorgabeTarif}
          volumen={volumen}
          feuerwehren={feuerwehren}
          onClose={() => setBuendelOffen(undefined)}
          onCreated={(rechnungId) => {
            setBuendelOffen(undefined);
            router.push(`/atemschutz/verrechnung/${rechnungId}`);
          }}
        />
      )}

      {empfaengerOffen && groupId && (
        <EmpfaengerDialog
          open
          groupId={groupId}
          feuerwehren={feuerwehren}
          onClose={() => setEmpfaengerOffen(false)}
          onSaved={() => setEmpfaengerOffen(false)}
        />
      )}

      {/* `key` erzwingt einen frischen Dialog je Eintrag — die Felder stehen
          im State und würden sonst den vorigen Empfänger weiterzeigen. */}
      {empfaengerEdit && groupId && (
        <EmpfaengerDialog
          open
          key={empfaengerEdit.id}
          groupId={groupId}
          empfaenger={empfaengerEdit}
          feuerwehren={feuerwehren}
          onClose={() => setEmpfaengerEdit(undefined)}
          onSaved={() => setEmpfaengerEdit(undefined)}
        />
      )}

      {loeschKandidat && groupId && (
        <ConfirmDialog
          title={tCommon('confirmTitle')}
          text={t('empfaenger.deleteConfirm', { name: loeschKandidat.name })}
          yes={tCommon('yes')}
          no={tCommon('no')}
          onConfirm={(confirmed) => {
            if (confirmed && loeschKandidat.id) {
              void deleteAtemschutzEmpfaenger({
                groupId,
                empfaengerId: loeschKandidat.id,
              });
            }
            setLoeschKandidat(undefined);
          }}
        />
      )}
    </Container>
  );
}
