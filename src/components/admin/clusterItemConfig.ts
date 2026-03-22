export type ClusterCollectionType =
  | 'hydrant'
  | 'risikoobjekt'
  | 'gefahrobjekt'
  | 'loeschteich'
  | 'saugstelle';

export interface FieldConfig {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'date';
  required?: boolean;
  tableColumn?: boolean;
}

export interface CollectionConfig {
  collection: ClusterCollectionType;
  displayName: string;
  fields: FieldConfig[];
}

export const ALLOWED_COLLECTIONS: ClusterCollectionType[] = [
  'hydrant',
  'risikoobjekt',
  'gefahrobjekt',
  'loeschteich',
  'saugstelle',
];

export const collectionConfigs: CollectionConfig[] = [
  {
    collection: 'hydrant',
    displayName: 'Hydranten',
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, tableColumn: true },
      { key: 'ortschaft', label: 'Ortschaft', type: 'text', tableColumn: true },
      { key: 'typ', label: 'Typ', type: 'text', tableColumn: true },
      { key: 'hydranten_nummer', label: 'Hydranten Nr.', type: 'text', tableColumn: true },
      { key: 'fuellhydrant', label: 'Füllhydrant', type: 'text' },
      { key: 'dimension', label: 'Dimension', type: 'text' },
      { key: 'leitungsart', label: 'Leitungsart', type: 'text' },
      { key: 'statischer_druck', label: 'Statischer Druck', type: 'number' },
      { key: 'dynamischer_druck', label: 'Dynamischer Druck', type: 'number' },
      { key: 'druckmessung_datum', label: 'Druckmessung Datum', type: 'date' },
      { key: 'meereshoehe', label: 'Meereshöhe', type: 'number' },
      { key: 'leistung', label: 'Leistung', type: 'text' },
    ],
  },
  {
    collection: 'risikoobjekt',
    displayName: 'Risikoobjekte',
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, tableColumn: true },
      { key: 'description', label: 'Beschreibung', type: 'textarea', tableColumn: true },
      { key: 'adresse', label: 'Adresse', type: 'text', tableColumn: true },
      { key: 'ortschaft', label: 'Ortschaft', type: 'text', tableColumn: true },
      { key: 'risikogruppe', label: 'Risikogruppe', type: 'text', tableColumn: true },
      { key: 'einsatzplanummer', label: 'Einsatzplanummer', type: 'text' },
      { key: 'erfassungsdatum', label: 'Erfassungsdatum', type: 'date' },
      { key: 'link', label: 'Link', type: 'text' },
    ],
  },
  {
    collection: 'gefahrobjekt',
    displayName: 'Gefahrobjekte',
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, tableColumn: true },
      { key: 'description', label: 'Beschreibung', type: 'textarea', tableColumn: true },
      { key: 'adresse', label: 'Adresse', type: 'text', tableColumn: true },
      { key: 'ortschaft', label: 'Ortschaft', type: 'text', tableColumn: true },
      { key: 'einsatzplanummer', label: 'Einsatzplanummer', type: 'text' },
      { key: 'erfassungsdatum', label: 'Erfassungsdatum', type: 'date' },
      { key: 'link', label: 'Link', type: 'text' },
    ],
  },
  {
    collection: 'loeschteich',
    displayName: 'Löschteiche',
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, tableColumn: true },
      { key: 'adresse', label: 'Adresse', type: 'text', tableColumn: true },
      { key: 'ortschaft', label: 'Ortschaft', type: 'text', tableColumn: true },
      { key: 'fassungsverm_gen_m3_', label: 'Fassungsvermögen (m³)', type: 'number', tableColumn: true },
      { key: 'zufluss_l_min_', label: 'Zufluss (l/min)', type: 'number' },
      { key: 'erfassungsdatum', label: 'Erfassungsdatum', type: 'date' },
    ],
  },
  {
    collection: 'saugstelle',
    displayName: 'Saugstellen',
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, tableColumn: true },
      { key: 'adresse', label: 'Adresse', type: 'text', tableColumn: true },
      { key: 'ortschaft', label: 'Ortschaft', type: 'text', tableColumn: true },
      { key: 'geod_tische_saugh_he_m_', label: 'Geodätische Saughöhe (m)', type: 'number', tableColumn: true },
      { key: 'saugleitungsl_nge_m_', label: 'Saugleitungslänge (m)', type: 'text' },
      { key: 'wasserentnahme_l_min_', label: 'Wasserentnahme (l/min)', type: 'number' },
      { key: 'erfassungsdatum', label: 'Erfassungsdatum', type: 'date' },
    ],
  },
];

export function getCollectionConfig(collection: ClusterCollectionType): CollectionConfig {
  return collectionConfigs.find((c) => c.collection === collection)!;
}

export function getTableColumns(config: CollectionConfig): FieldConfig[] {
  return config.fields.filter((f) => f.tableColumn);
}
