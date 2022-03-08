import harparser from './harparser';
import firestoreImport from './firestore-import';

async function extractImport(
  inputHar: string,
  ortschaft: string,
  collectionName: string
) {
  const csvFile = await harparser(inputHar, ortschaft);
  await firestoreImport(collectionName, csvFile);
}

if (require.main === module) {
  if (process.argv.length < 5) {
    console.error(
      `Usage: ${process.argv[0]} ${process.argv[1]} ortschaft harFile collectionName`
    );
    process.exit(5);
  }
  console.info(`main export import`);
  extractImport(process.argv[3], process.argv[2], process.argv[4]);
}

export default extractImport;
