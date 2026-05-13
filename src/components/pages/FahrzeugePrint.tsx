'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { formatTimestamp } from '../../common/time-format';
import useVehicles from '../../hooks/useVehicles';
import { getItemInstance } from '../FirecallItems/elements';
import { useContext, useMemo } from 'react';
import { FirecallItem } from '../firebase/firestore';
import { useFirecallLayers } from '../../hooks/useFirecallLayers';
import React from 'react';
import { FirecallContext } from '../../hooks/useFirecall';
import { getEffectiveBesatzung } from '../../common/vehicle-utils';

interface FcItemRowProps {
  item: FirecallItem;
}
function FcItemRow({ item }: FcItemRowProps) {
  const itemDetails = useMemo(() => getItemInstance(item), [item]);
  return (
    <tr key={item.id}>
      <td>{itemDetails.markerName()}</td>
      <td>{itemDetails.title()}</td>
      <td>
        {itemDetails.popupFn()}
        {itemDetails.body()}
      </td>
      <td>{item.datum && formatTimestamp(item.datum)}</td>
      <td>
        {item.lat} {item.lng}
      </td>
    </tr>
  );
}

export default function FahrzeugePrint() {
  const t = useTranslations('print');
  const { vehicles, rohre, otherItems: others } = useVehicles();
  const { crewAssignments } = useContext(FirecallContext);
  const layers = useFirecallLayers();
  const otherItems = [...rohre, ...others];

  const totalCrew = vehicles
    .map((v) => {
      const crewCount = crewAssignments.filter((c) => c.vehicleId === v.id).length;
      return getEffectiveBesatzung(v.besatzung, crewCount) + 1;
    })
    .reduce((p, c) => p + c, 0);

  return (
    <Box sx={{ p: 2, m: 2 }}>
      <Typography variant="h3" gutterBottom>
        {t('sectionVehiclesHeading', { count: vehicles.length, crew: totalCrew })}
      </Typography>
      <table>
        <thead>
          <tr>
            <th>{t('cols.fw')}</th>
            <th>{t('cols.vehicleLabel')}</th>
            <th>{t('cols.crewAts')}</th>
            <th>{t('cols.description')}</th>
            <th>{t('cols.alarmierung')}</th>
            <th>{t('cols.eintreffen')}</th>
            <th>{t('cols.abruecken')}</th>
            <th>{t('cols.gps')}</th>
          </tr>
        </thead>
        <tbody>
          {[
            {
              id: undefined,
              name: t('unassignedShort'),
            },
            ...Object.values(layers),
          ].map((layer) => (
            <React.Fragment key={`fzg-layers-${layer.id}`}>
              <tr>
                <th> </th>
                <th>{layer.name}</th>
              </tr>
              {vehicles
                .filter((v) => v.layer === layer.id)
                .sort(
                  (
                    { fw: a = '', name: aa = '' },
                    { fw: b = '', name: bb = '' }
                  ) => a.localeCompare(b) - aa.localeCompare(bb) / 10
                )
                .map((fzg) => (
                  <tr key={fzg.id}>
                    <td>{fzg.fw}</td>
                    <td>{fzg.name}</td>
                    <td>
                      {(() => {
                        const crewCount = crewAssignments.filter((c) => c.vehicleId === fzg.id).length;
                        const bes = getEffectiveBesatzung(fzg.besatzung, crewCount);
                        return `1:${bes} (${fzg.ats})`;
                      })()}
                    </td>
                    <td>{fzg.beschreibung}</td>
                    <td>
                      {fzg.alarmierung && formatTimestamp(fzg.alarmierung)}
                    </td>
                    <td>{fzg.eintreffen && formatTimestamp(fzg.eintreffen)}</td>
                    <td>{fzg.abruecken && formatTimestamp(fzg.abruecken)}</td>
                    <td>
                      {fzg.lat} {fzg.lng}
                    </td>
                  </tr>
                ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>

      <Typography variant="h3" gutterBottom>
        {t('sectionMoreMarkers', { count: otherItems.length })}
      </Typography>
      <table>
        <thead>
          <tr>
            <th>{t('cols.type')}</th>
            <th>{t('cols.plainName')}</th>
            <th>{t('cols.description')}</th>
            <th>{t('cols.date')}</th>
            <th>{t('cols.coordinates')}</th>
          </tr>
        </thead>
        <tbody>
          {otherItems
            .filter((item) => item.layer === undefined)
            .map((item) => (
              <FcItemRow key={item.id} item={item} />
            ))}
          {Object.values(layers).map((l) => (
            <React.Fragment key={l.id || 'default-layer'}>
              <tr>
                <th> </th>
                <th>{l.name}</th>
              </tr>
              {otherItems
                .filter((item) => item.layer === l.id)
                .map((item) => (
                  <FcItemRow key={item.id} item={item} />
                ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </Box>
  );
}
