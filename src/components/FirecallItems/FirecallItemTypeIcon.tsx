'use client';

import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import Image from 'next/image';
import { getItemClass } from './elements';

export interface FirecallItemTypeIconOptions {
  /** firecall item type key, e.g. `vehicle` or `hydrant` */
  type: string;
  /** rendered width in px; the height follows the icon's aspect ratio */
  size?: number;
}

/**
 * Renders the map icon of a firecall item type. Non-square icons (Rohr,
 * Leitung, …) keep their aspect ratio instead of being squeezed into a box.
 */
export default function FirecallItemTypeIcon({
  type,
  size = 24,
}: FirecallItemTypeIconOptions) {
  // `upload` is a pseudo type without an item class and would fall back to the
  // generic marker icon, which says nothing about what it does.
  if (type === 'upload') {
    return <PhotoCameraIcon sx={{ width: size, height: size }} />;
  }

  const icon = getItemClass(type).factory().icon();
  const [iw, ih] = icon.options.iconSize as [number, number];
  const iconUrl = icon.options.iconUrl;

  if (!iconUrl) {
    return null;
  }

  if (iw === ih) {
    return <Image src={iconUrl} alt="" width={size} height={size} />;
  }

  return (
    // next/image would need explicit dimensions per icon; a plain img keeps the
    // aspect ratio with a single rule.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={iconUrl}
      alt=""
      width={size}
      height={Math.round((size * ih) / iw)}
    />
  );
}
