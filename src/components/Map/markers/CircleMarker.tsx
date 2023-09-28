import L from 'leaflet';
import { Circle as LeafletCircle, Popup } from 'react-leaflet';
import { defaultPosition } from '../../../hooks/constants';
import { Circle } from '../../firebase/firestore';
import {
  FirecallItemMarkerDefault,
  FirecallItemMarkerProps,
} from './FirecallItemMarker';
import IconButton from '@mui/material/IconButton';
import EditIcon from '@mui/icons-material/Edit';
import { firecallItemInfo } from '../../FirecallItems/infos/firecallitems';

interface CircleMarkerProps extends FirecallItemMarkerProps {}

export default function CircleMarker({
  record,
  selectItem,
}: CircleMarkerProps) {
  const circle = record as any as Circle;
  const itemInfo = firecallItemInfo(record.type);

  return (
    <>
      <FirecallItemMarkerDefault record={record} selectItem={selectItem} />
      <LeafletCircle
        color={circle.color}
        radius={circle.radius || 50}
        center={L.latLng(
          record.lat || defaultPosition.lat,
          record.lng || defaultPosition.lng
        )}
        opacity={(circle.opacity || 100) / 100}
        fill={false}
      >
        <Popup>
          <IconButton
            sx={{ marginLeft: 'auto', float: 'right' }}
            onClick={() => selectItem(record)}
          >
            <EditIcon />
          </IconButton>
          {itemInfo.popupFn(record)}
        </Popup>
      </LeafletCircle>
    </>
  );
}
