import { FirecallItem } from '../../firebase/firestore';
import { asspInfo } from './assp';
import { connectionInfo } from './connection';
import { diaryItemInfo } from './diary';
import { elInfo } from './el';
import { fallbackInfo } from './fallback';
import { markerInfo } from './marker';
import { rohrItemInfo } from './rohr';
import { FirecallItemInfo, FirecallItemInfoList } from './types';
import { vehicleItemInfo } from './vehicle';

export const firecallItems: FirecallItemInfoList = {
  vehicle: vehicleItemInfo as FirecallItemInfo<FirecallItem>,
  rohr: rohrItemInfo as unknown as FirecallItemInfo<FirecallItem>,
  connection: connectionInfo as unknown as FirecallItemInfo<FirecallItem>,
  marker: markerInfo as unknown as FirecallItemInfo<FirecallItem>,
  el: elInfo,
  assp: asspInfo,
  diary: diaryItemInfo as unknown as FirecallItemInfo<FirecallItem>,
  fallback: fallbackInfo,
};

export const firecallItemInfo = (type: string = 'fallback') =>
  firecallItems[type] || firecallItems.fallback;
