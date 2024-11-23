// based on https://github.com/Jose-cd/React-google-drive-picker

import { useCallback, useEffect, useState } from 'react';
import useInjectScript from './useInjectScript';
import {
  authResult,
  defaultConfiguration,
  PickerConfiguration,
} from './typeDef';

export default function useDrivePicker(): [
  (config: PickerConfiguration) => boolean | undefined,
  authResult | undefined
] {
  const [loaded, error] = useInjectScript('https://apis.google.com/js/api.js');
  const [loadedGsi, errorGsi] = useInjectScript(
    'https://accounts.google.com/gsi/client'
  );
  const [pickerApiLoaded, setpickerApiLoaded] = useState(false);
  const [openAfterAuth, setOpenAfterAuth] = useState(false);
  const [config, setConfig] =
    useState<PickerConfiguration>(defaultConfiguration);
  const [authRes, setAuthRes] = useState<authResult>();

  // get the apis from googleapis
  useEffect(() => {
    if (loaded && !error && loadedGsi && !errorGsi && !pickerApiLoaded) {
      window.gapi.load('auth');
      window.gapi.load('picker', {
        callback: () => {
          setpickerApiLoaded(true);
        },
      });
    }
  }, [error, errorGsi, loaded, loadedGsi, pickerApiLoaded]);

  const createPicker = useCallback(
    ({
      token,
      appId = '',
      developerKey,
      viewId = 'DOCS',
      disabled,
      multiselect,
      setOrigin,
      showUploadView = false,
      showUploadFolders,
      setParentFolder = '',
      viewMimeTypes,
      customViews,
      locale = 'en',
      addRecentView = false,
      setIncludeFolders,
      setSelectFolderEnabled,
      disableDefaultView = false,
      callbackFunction,
      supportsSharedDrives = true,
      addMyDrive = false,
    }: PickerConfiguration) => {
      if (disabled) return false;

      const view = new google.picker.DocsView(google.picker.ViewId[viewId]);
      if (viewMimeTypes) {
        view.setMimeTypes(viewMimeTypes);
      }
      if (setIncludeFolders) view.setIncludeFolders(true);
      if (setSelectFolderEnabled) view.setSelectFolderEnabled(true);

      const uploadView = new google.picker.DocsUploadView();

      // if (viewMimeTypes) uploadView.setMimeTypes(viewMimeTypes);
      if (showUploadFolders) uploadView.setIncludeFolders(true);
      if (setParentFolder) uploadView.setParent(setParentFolder);
      if (setParentFolder) view.setParent(setParentFolder);

      const picker = new google.picker.PickerBuilder()
        .setAppId(appId)
        .setOAuthToken(token || 'no access token ??')
        .setDeveloperKey(developerKey)
        .setLocale(locale)
        .setCallback(callbackFunction);

      if (setOrigin) {
        picker.setOrigin(setOrigin);
      }

      if (!disableDefaultView) {
        picker.addView(view);
      }

      if (addMyDrive) {
        const myDriveView = new google.picker.DocsView();
        myDriveView.setIncludeFolders(true);
        myDriveView.setParent('root');
        if (viewMimeTypes) myDriveView.setMimeTypes(viewMimeTypes);
        picker.addView(myDriveView);
      }

      if (supportsSharedDrives) {
        const shareDriveView = new google.picker.DocsView();
        if (viewMimeTypes) shareDriveView.setMimeTypes(viewMimeTypes);
        shareDriveView.setIncludeFolders(true);
        shareDriveView.setEnableDrives(true);
        picker.addView(shareDriveView);
      }

      if (customViews) {
        customViews.map((view) => picker.addView(view));
      }

      if (multiselect) {
        picker.enableFeature(google.picker.Feature.MULTISELECT_ENABLED);
      }

      if (showUploadView) picker.addView(uploadView);

      // if (addRecentView) {
      //   let recentView = new google.picker.DocsView();

      //   // (recentView as any).xd = 'Recent';
      //   // (recentView as any).mc.sortKey = 15;
      //   picker.addView(recentView);
      // }

      picker.build().setVisible(true);
      return true;
    },
    []
  );

  // open the picker
  const openPicker = useCallback(
    (config: PickerConfiguration) => {
      // global scope given conf
      setConfig(config);

      // if we didnt get token generate token.
      if (!config.token) {
        const client = (google as any).accounts.oauth2.initTokenClient({
          client_id: config.clientId,
          scope: (
            config.customScopes || [
              'https://www.googleapis.com/auth/drive.readonly',
            ]
          ).join(' '),
          callback: (tokenResponse: authResult) => {
            console.info(`got token response`, tokenResponse);
            setAuthRes(tokenResponse);
            createPicker({ ...config, token: tokenResponse.access_token });
          },
        });

        client.requestAccessToken();
      }

      // if we have token and everything is loaded open the picker
      if (config.token && loaded && !error && pickerApiLoaded) {
        return createPicker(config);
      }
    },
    [loaded, error, pickerApiLoaded, createPicker]
  );

  // use effect to open picker after auth
  useEffect(() => {
    if (
      openAfterAuth &&
      config.token &&
      loaded &&
      !error &&
      loadedGsi &&
      !errorGsi &&
      pickerApiLoaded
    ) {
      createPicker(config);
      setOpenAfterAuth(false);
    }
  }, [
    openAfterAuth,
    config.token,
    loaded,
    error,
    loadedGsi,
    errorGsi,
    pickerApiLoaded,
    config,
    createPicker,
  ]);

  return [openPicker, authRes];
}
