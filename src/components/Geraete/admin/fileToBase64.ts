/**
 * Liest eine Datei als Base64 ohne `data:`-Präfix — so erwarten sie
 * `previewGeraetImport` und `importGeraete`. Über `FileReader`, weil
 * `Blob.arrayBuffer` nicht in jeder WebView der Android-App vorhanden ist.
 */
export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}
