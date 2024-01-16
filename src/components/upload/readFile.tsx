export default async function readFileAsText(file: File): Promise<string> {
  const result = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('loadend', (ev) => {
      if (!reader.result) {
        console.warn('failed to read file, reader empty');
        reject('failed to read file, reader empty');
      } else {
        resolve(reader.result?.toString());
      }
    });
    reader.addEventListener('error', (ev) => {
      reject('load error');
    });
    console.log(`reading as text`);
    reader.readAsText(file, 'utf8');
    console.log(`text read`);
  });

  return result;
}
