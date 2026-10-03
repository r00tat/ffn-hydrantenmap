# Offline mode

The operations map also works without an internet connection. While offline you can create a new operation, keep the operation log, draw elements on the map and monitor breathing apparatus teams. Everything you record offline is stored on the device and transferred automatically as soon as the connection is back.

## Features

- **Connection status in the header** The app checks by itself whether the server can be reached – even on a Wi-Fi without internet
- **Keep working offline** Operations, operation log, map, layers, crew, breathing apparatus staging area, cylinder filling log and breathing apparatus monitoring
- **Automatic sync** on reconnect, even after the app has been restarted
- **Rejected changes are reported** and can be retried or discarded
- **Attachments are uploaded later** – a file added offline is uploaded once the connection is back
- **Cold start without network** – the app opens in airplane mode too, if you signed in online within the last 72 hours
- **Prepare map for offline use** – download map tiles for the area around the operation in advance
- **Breathing apparatus warnings offline** – the monitoring page warns by itself when no push message arrives

## Instructions

### Reading the connection status

A chip appears in the header whenever something is not normal:

| Display | Meaning |
| --- | --- |
| *(no chip)* | Connected, everything transferred |
| **Offline mode** | No connection to the server. Changes stay on the device. If it says "N changes pending", that many changes are waiting to be transferred. |
| **N changes are being transferred…** | The connection is back, data recorded offline is being transferred |
| **N changes not transferred** (red) | The server rejected changes – see below |

Tap the "Offline mode" chip to check the connection again right away. After the transfer, "Changes have been synced" appears briefly.

:::info
The app does not rely on whether the device shows "Wi-Fi" or "mobile data"; it asks the server at regular intervals. A vehicle Wi-Fi without internet is therefore correctly recognised as offline.
:::

### Working offline

Just keep working as usual. Dialogs close right after saving, even without a connection. A small cloud icon in the operation log and in the pressure history of breathing apparatus monitoring marks entries that are only stored on this device so far.

You can create a new operation offline. Taking over the Alarm SMS and checking for an existing operation are skipped then – the dialog tells you so.

### What does not work offline

Features that need the server are greyed out offline. A tooltip says "Only available with an internet connection". This mainly concerns:

- AI assistant and voice assistant
- Invoices for breathing apparatus billing, sending mail (invoices, cost recovery)
- PDF export (cylinder filling log, trip log)
- Trip log entries, defects and defect photos
- Operation photos in Google Drive
- Street routing and elevation profile of hose lines – offline the line stays a straight line
- Administration (users, groups, share links, import and export)

### Adding attachments offline

You can add files to an existing operation or element while offline. They show up as "<file> – waiting for upload" and are uploaded after reconnecting; only then is the attachment part of the operation. For a new element that has not been saved yet, uploading offline is not possible – save the element first.

### Rejected changes

Whether you are allowed to make a change is only checked by the server during the transfer. If it rejects a change, the entry disappears again and the red chip "N changes not transferred" appears in the header.

1. Tap the red chip
2. The list shows the kind, time, location and error code of each change
3. Choose **Try again** (where possible), **Discard** or **Discard all**

:::warning
The list of rejected changes is only kept until the app is reloaded. Check it before restarting the app.
:::

### Before the operation: prepare the map for offline use

The app automatically stores the data of the open operation on the device (elements, log, teams, equipment, list of recent operations, nearby hydrants) as soon as you open an operation online. Map tiles you have to download yourself:

1. Open the operation details page, section **Offline map** (centred on the operation location) – or your **profile** (centred on your location; tap **Use location** if needed)
2. Choose the **Radius** (500 m to 3 km) and the layers (Basemap, Orthophoto, Basemap grey, Addresses)
3. The app shows the number of tiles and the approximate size
4. Tap **Prepare for offline use** – progress is shown, and **Cancel** stops at any time
5. **Delete** frees the storage again

:::info
Only the basemap from basemap.at can be downloaded in advance. OpenStreetMap and OpenTopoMap prohibit bulk downloading; offline they are only available as far as you viewed the map before.
:::

Empty lists are marked offline ("Offline – no entries on this device"), filled ones with "Offline – possibly incomplete". A list that was never opened online on this device may be empty offline even though entries exist.

### Starting the app without network

If you signed in online and used the app within the last 72 hours, it opens without the login screen even in airplane mode. Your permissions then come from the last sign-in; the tooltip on the status says so. As soon as the connection is back, the sign-in is checked with the server again.

A page that was not kept on the device shows "Offline – page not available" offline, with a **Go to map** button.

:::warning
In the Android app, starting without network does not work yet. Keep the app open during the operation instead of closing it.
:::

### Breathing apparatus monitoring offline

Without a connection no push messages arrive from the server. The open monitoring page therefore warns by itself – for the retreat, the third marks and the end of the operating time.

- Keep the **monitoring page open** on the device where the pressure readings are recorded
- While a team is deployed, the app keeps the screen on (where the browser supports it); a note on the page shows this
- After reconnecting, the server warnings are re-planned for all deployed teams

:::warning
Other devices only see the pressure readings after reconnecting. When offline, always monitor a team on the device where you record the readings.
:::

## Limitations

- **No sync between devices without internet.** Two devices that are offline at the same time only see each other's entries after reconnecting. An LTE router in the vehicle helps.
- **Simultaneous changes:** if two devices change the same field offline, the change transferred last wins.
- **Only loaded data is available offline.** Anything never opened online on this device is missing offline.
