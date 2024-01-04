# Hydrantenkarte der Freiwilligen Feuerwehr Neusiedl am See

Dieses Repository ermöglicht es Hydranten auf einer Karte darzustellen. Ziel ist es möglichst leicht im Einsatzfall Hydranten lokalisieren zu können.

Für eingeloggte Benutzer bietet es darüber hinaus die Möglichkeit einer Lageführung und eines Einsatztagebuchs.

Die Web App ist für Mobilgeräte optimiert um dies möglicht leicht im Einsatz verwenden zu können.

Die Applikation ist [Open Source](LICENSE) und kann auch von anderen Feuerwehren auf GCP deployed werden.

## Development

First, run the development server:

```bash
npm run dev
# or
yarn dev
```

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

## deploy to GCP

```bash
IMAGE_TAG=$(date +%Y%m%d-%H%M%S)
gcloud builds submit . -t eu.gcr.io/ffn-utils/hydrantenmap:$IMAGE_TAG
gcloud run deploy hydrantenmap --allow-unauthenticated --image eu.gcr.io/ffn-utils/hydrantenmap:$IMAGE_TAG --max-instances=2 --region europe-west4
```

To store attachments on firebase storage, you need to configure the default storage bucket and set the [CORS policy](https://firebase.google.com/docs/storage/web/download-files?hl=en#download_data_directly_from_the_sdk) on the bucket. (`gsutil cors set cors.json gs://<PROJECT-ID>.appspot.com/`)

## Importing data

Open the [Burgenland GIS](https://gis.bgld.gv.at/Datenerhebung/) login and open the developer tools. Select only one kind of objects (only Hydranten for example) and log the whole network requests. Export the network requests as har file.

```bash
export GOOGLE_APPLICATION_CREDENTIALS=$PWD/config/service_account.json
npm run extract hars/saugstelle.har ND
npm run import saugstelle output/wgs.csv
```
