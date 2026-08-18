/**
 * PUT der Dateibytes auf eine resumable Upload-Session.
 *
 * `XMLHttpRequest` statt `fetch`, weil nur XHR einen Fortschritt beim
 * *Senden* meldet — `fetch` kann das bis heute nicht.
 */
export function uploadToDriveSession(
  uploadUrl: string,
  file: File,
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader(
      'Content-Type',
      file.type || 'application/octet-stream',
    );
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded, event.total);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`upload failed with status ${xhr.status}`));
      }
    };
    xhr.onerror = () =>
      reject(new Error('upload failed (network or CORS error)'));
    xhr.send(file);
  });
}
