// based on https://github.com/Jose-cd/React-google-drive-picker

export type CallbackDoc = {
  downloadUrl?: string;
  uploadState?: string;
  description: string;
  driveSuccess: boolean;
  embedUrl: string;
  iconUrl: string;
  id: string;
  isShared: boolean;
  lastEditedUtc: number;
  mimeType: string;
  name: string;
  rotation: number;
  rotationDegree: number;
  serviceId: string;
  sizeBytes: number;
  type: string;
  url: string;
};

export type PickerCallback = {
  action: string;
  docs: CallbackDoc[];
};

export type authResult = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  authuser: string;
  prompt: string;
};

type ViewIdOptions =
  | 'DOCS'
  | 'DOCS_IMAGES'
  | 'DOCS_IMAGES_AND_VIDEOS'
  | 'DOCS_VIDEOS'
  | 'DOCUMENTS'
  | 'DRAWINGS'
  | 'FOLDERS'
  | 'FORMS'
  | 'PDFS'
  | 'SPREADSHEETS'
  | 'PRESENTATIONS';

export type PickerConfiguration = {
  clientId: string;
  developerKey: string;
  viewId?: ViewIdOptions;
  viewMimeTypes?: string;
  setIncludeFolders?: boolean;
  setSelectFolderEnabled?: boolean;
  disableDefaultView?: boolean;
  addRecentView?: boolean;
  token?: string;
  setOrigin?: string;
  multiselect?: boolean;
  disabled?: boolean;
  appId?: string;
  showUploadView?: boolean;
  showUploadFolders?: boolean;
  setParentFolder?: string;
  customViews?: any[];
  addMyDrive?: boolean;
  supportsSharedDrives?: boolean;
  locale?: google.picker.Locales;
  customScopes?: string[];
  callbackFunction: (data: google.picker.ResponseObject) => any;
  onOpen?: () => void;
};

export const defaultConfiguration: PickerConfiguration = {
  clientId: '',
  developerKey: '',
  viewId: 'DOCS',
  callbackFunction: () => null,
};
