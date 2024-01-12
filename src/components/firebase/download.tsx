/**
 * download a Blob in the browser
 * 
 * const blob = new Blob([JSON.stringify(firecallData)], {
    type: 'application/json',
  });
  downloadBlob(blob, `firecall-export-${firecallId}.json`);
 * @param blob Blob to download
 * @param filename filename to present to the browser
 * @returns a HTMLAnchorelemnt used for the download
 */
export function downloadBlob(blob: Blob | MediaSource, filename: string) {
  // Create an object URL for the blob object
  const url = URL.createObjectURL(blob);

  // Create a new anchor element
  const a = document.createElement('a');

  // Set the href and download attributes for the anchor element
  // You can optionally set other attributes like `title`, etc
  // Especially, if the anchor element will be attached to the DOM
  a.href = url;
  a.download = filename || 'download';

  // Click handler that releases the object URL after the element has been clicked
  // This is required for one-off downloads of the blob content
  const clickHandler = () => {
    setTimeout(() => {
      URL.revokeObjectURL(url);
      removeEventListener('click', clickHandler);
    }, 150);
  };

  // Add the click event listener on the anchor element
  // Comment out this line if you don't want a one-off download of the blob content
  a.addEventListener('click', clickHandler, false);

  // Programmatically trigger a click on the anchor element
  // Useful if you want the download to happen automatically
  // Without attaching the anchor element to the DOM
  // Comment out this line if you don't want an automatic download of the blob content
  a.click();

  // Return the anchor element
  // Useful if you want a reference to the element
  // in order to attach it to the DOM or use it in some other way
  return a;
}

/**
 * Download a string as file in the browser
 *
 * @param text file contents as string
 * @param filename filename to download
 * @param mimeType mimetype of the file
 * @returns HTMLAnchor element used for the download
 */
export function downloadText(text: string, filename: string, mimeType: string) {
  const blob = new Blob([text], {
    type: mimeType,
  });
  return downloadBlob(blob, filename);
}

export function downloadRowsAsCsv(rows: any[][], filename: string) {
  return downloadText(
    rows
      .map((row) => row.map((v) => (v ? '' + v : '')))
      .map((r) => JSON.stringify(r).replace(/^\[/, '').replace(/\]/, ''))
      .join('\n'),
    filename,
    'text/csv'
  );
}
