import { ReactNode } from 'react';
import { FirecallItem } from '../../firebase/firestore';

export interface FirecallItemInfo<T = FirecallItem> {
  name: string;
  title: (item: T) => string;
  info: (item: T) => string;
  body: (item: T) => string;
  dialogText: (item: T) => string | ReactNode;
  fields: {
    [fieldName: string]: string;
  };

  dateFields: string[];
  /**
   * render popup html
   */
  popupFn: (gisObject: T) => string | ReactNode;

  /**
   * render marker title as text
   */
  titleFn: (gisObject: T) => string;

  /**
   * icon
   */
  icon: L.IconOptions | ((gisObject: T) => L.Icon);

  /**
   * create a new element
   */
  factory: () => T;
}

export interface FirecallItemInfoList<T = FirecallItem> {
  [key: string]: FirecallItemInfo<T>;
}
