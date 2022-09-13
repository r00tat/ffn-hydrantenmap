export interface GisObject {
  c_x: number;
  c_y: number;
  name: string;
  [key: string]: any;
}

export interface WgsObject {
  id?: string;
  lat: number;
  lng: number;
  name: string;
  [key: string]: any;
}
export interface Coordinates {
  x: number;
  y: number;
}

export interface GisWgsObject extends GisObject, WgsObject {}

export const GEOHASH_PRECISION = 6;

// Name,ortschaft,Typ,Hydranten Nummer,Fuellhydrant,Dimension,Leitungsart,Statischer Druck,Dynamischer Druck,DRUCKMESSUNG_DATUM,Meereshoehe,c_x,c_y,
export interface HydrantenRecord extends WgsObject {
  ortschaft: string;
  typ: string;
  hydranten_nummer: string;
  fuellhydrant: string;
  dimension: number | string;
  leitungsart: string;
  statischer_druck: number;
  dynamischer_druck: number;
  druckmessung_datum: string;
  meereshoehe: number;
  geohash: string;
  leistung?: string;
}

export interface RisikoObjekt extends WgsObject {
  adresse: string;
  bezeichnung: string;
  einsatzplanummer: string;
  erfassungsdatum: string;
  ortschaft: string;
  risikogruppe: string;
  link?: string;
}

export interface GefahrObjekt extends WgsObject {
  adresse: string;
  bezeichnung: string;
  einsatzplanummer: string;
  erfassungsdatum: string;
  ortschaft: string;
  link?: string;
}

export interface Loeschteich extends WgsObject {
  bezeichnung_adresse: string;
  erfassungsdatum: string;
  fassungsverm_gen_m3_: number;
  ortschaft: string;
  zufluss_l_min_: number;
}
export interface Saugstelle extends WgsObject {
  bezeichnung_adresse: string;
  erfassungsdatum: string;
  geod_tische_saugh_he_m_: number;
  ortschaft: string;
  saugleitungsl_nge_m_: string;
  wasserentnahme_l_min_: number;
}

export interface GeohashCluster {
  hydranten?: HydrantenRecord[];
  geohash: string;
  risikoobjekt?: RisikoObjekt[];
  gefahrobjekt?: GefahrObjekt[];
  loeschteich?: Loeschteich[];
  saugstelle?: Saugstelle[];

  [hash: string]: any;
}
