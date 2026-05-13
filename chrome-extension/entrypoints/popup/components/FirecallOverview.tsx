import {
  Box,
  Typography,
  Chip,
  Skeleton,
  Divider,
  Link,
  List,
  ListItem,
  ListSubheader,
} from '@mui/material';
import LocalFireDepartment from '@mui/icons-material/LocalFireDepartment';
import DirectionsCar from '@mui/icons-material/DirectionsCar';
import People from '@mui/icons-material/People';
import AccessTime from '@mui/icons-material/AccessTime';
import {
  Firecall,
  FirecallItem,
  CrewAssignment,
  funktionAbkuerzung,
} from '@shared/types';
import { EINSATZKARTE_URL } from '@shared/config';
import { useLocale, useTranslations } from '@shared/i18n';

interface FirecallOverviewProps {
  firecall: Firecall | undefined;
  firecallId: string | null;
  items: FirecallItem[];
  crew: CrewAssignment[];
  loading: boolean;
}

interface Fzg extends FirecallItem {
  fw?: string;
  besatzung?: string;
  type: 'vehicle';
}

export default function FirecallOverview({
  firecall,
  firecallId,
  items,
  crew,
  loading,
}: FirecallOverviewProps) {
  const t = useTranslations('overview');
  const locale = useLocale();
  if (loading || !firecall) {
    return <Skeleton variant="rectangular" height={200} />;
  }

  const dateLocale = locale === 'en' ? 'en-GB' : 'de-AT';

  const vehicles = items.filter((i): i is Fzg => i.type === 'vehicle');
  const isActive = !!firecall.eintreffen && !firecall.abruecken;

  const crewByVehicle = new Map<string | null, CrewAssignment[]>();
  for (const member of crew) {
    const key = member.vehicleId;
    const list = crewByVehicle.get(key) ?? [];
    list.push(member);
    crewByVehicle.set(key, list);
  }

  const unassignedCrew = crewByVehicle.get(null) ?? [];

  const detailUrl = firecallId
    ? `${EINSATZKARTE_URL}/einsatz/${firecallId}/details`
    : undefined;

  const handleTitleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (detailUrl) {
      chrome.tabs.create({ url: detailUrl });
    }
  };

  return (
    <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <LocalFireDepartment color="error" />
        {detailUrl ? (
          <Link
            href={detailUrl}
            onClick={handleTitleClick}
            underline="hover"
            color="inherit"
            variant="h6"
            sx={{ flex: 1, cursor: 'pointer' }}
          >
            {firecall.name}
          </Link>
        ) : (
          <Typography variant="h6" sx={{ flex: 1 }}>
            {firecall.name}
          </Typography>
        )}
        <Chip
          label={isActive ? t('active') : t('ended')}
          color={isActive ? 'error' : 'default'}
          size="small"
        />
      </Box>

      {firecall.description && (
        <Typography variant="body2" color="text.secondary">
          {firecall.description}
        </Typography>
      )}

      <Divider />

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <AccessTime fontSize="small" color="action" />
          <Typography variant="body2">
            {firecall.date
              ? new Date(firecall.date).toLocaleString(dateLocale)
              : '\u2013'}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <DirectionsCar fontSize="small" color="action" />
          <Typography variant="body2">
            {vehicles.length === 1
              ? t('vehiclesSingular', { count: vehicles.length })
              : t('vehiclesPlural', { count: vehicles.length })}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <People fontSize="small" color="action" />
          <Typography variant="body2">
            {crew.length === 1
              ? t('personsSingular', { count: crew.length })
              : t('personsPlural', { count: crew.length })}
          </Typography>
        </Box>
      </Box>

      {(vehicles.length > 0 || crew.length > 0) && (
        <>
          <Divider />
          <List dense disablePadding>
            {vehicles.map((vehicle) => {
              const vehicleCrew = crewByVehicle.get(vehicle.id!) ?? [];
              return (
                <Box key={vehicle.id}>
                  <ListSubheader
                    disableSticky
                    sx={{ lineHeight: '32px', px: 1 }}
                  >
                    <Box
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                    >
                      <DirectionsCar fontSize="small" />
                      <strong>{vehicle.name}</strong>
                      {vehicle.fw && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          component="span"
                        >
                          ({vehicle.fw})
                        </Typography>
                      )}
                    </Box>
                  </ListSubheader>
                  {vehicleCrew.length > 0 ? (
                    vehicleCrew.map((member) => (
                      <ListItem key={member.id} sx={{ py: 0, pl: 4 }}>
                        <Typography variant="body2">
                          {funktionAbkuerzung(member.funktion)}: {member.name}
                        </Typography>
                      </ListItem>
                    ))
                  ) : (
                    <ListItem sx={{ py: 0, pl: 4 }}>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ fontStyle: 'italic' }}
                      >
                        {t('noCrew')}
                      </Typography>
                    </ListItem>
                  )}
                </Box>
              );
            })}
            {unassignedCrew.length > 0 && (
              <Box>
                <ListSubheader
                  disableSticky
                  sx={{ lineHeight: '32px', px: 1 }}
                >
                  <Box
                    sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                  >
                    <People fontSize="small" />
                    <strong>{t('noVehicle')}</strong>
                  </Box>
                </ListSubheader>
                {unassignedCrew.map((member) => (
                  <ListItem key={member.id} sx={{ py: 0, pl: 4 }}>
                    <Typography variant="body2">
                      {funktionAbkuerzung(member.funktion)}: {member.name}
                    </Typography>
                  </ListItem>
                ))}
              </Box>
            )}
          </List>
        </>
      )}
    </Box>
  );
}
