# Equipment & supplies

"Equipment & supplies" holds your fire brigade's equipment and stock items — taken over from Sybos, with the stock per storage location. During an operation you can assign equipment and record consumables (e.g. protective suits, filters, absorbents); consumption is booked off the stock automatically. When the stock falls below the minimum, a "please reorder" notice is sent.

## Features

- **Item list:** all equipment and stock items with storage locations and total stock, filterable by class, location, consumable and "below minimum"
- **To reorder:** items whose stock has fallen below the minimum
- **Stock per location:** vehicle and compartment (e.g. "SRF · GR 2") or room (e.g. "Fire station · Storage")
- **Receipt, transfer, stocktaking:** top up stock, move it between locations or set the counted value
- **Import from Sybos:** item export as an Excel file, with a preview before applying
- **During an operation:** assign equipment and consume supplies, even without a connection

## Instructions

### During an operation: assign equipment or consume supplies

1. Open the "Equipment & supplies" section of the operation
2. Search for the item (name or inventory number)
3. For equipment, enter the quantity or hours — the stock does not change
4. For consumables, enter the quantity and choose the location it was taken from
5. Save — the entry shows up in the operation immediately

:::info
Without a connection the entry is stored on the device. Booking it off the stock happens as soon as the connection is back. Until then the entry is marked as "not yet booked".
:::

If a consumption is changed or deleted later, the stock is corrected accordingly.

### Maintain stock

1. Open "Equipment & supplies" in the menu
2. Select an item
3. At the location, choose **Receipt** (supplies arrived), **Transfer** (e.g. from storage to the SRF) or **Stocktaking** (enter the counted value)
4. On the item, set whether it is a **consumable** and, if needed, a **unit** and a **minimum stock**

### Import from Sybos

1. Create the item export in Sybos as an Excel file (one row per item and location)
2. In "Equipment & supplies", click "Import" and choose the file
3. Check the preview: new items, changed master data, new locations and stock deviations
4. Accept each deviation as stocktaking or discard it
5. Confirm the import

:::warning
If supplies were consumed or stock was booked by hand since the last import, the import does not simply overwrite the stock. The preview lists such deviations one by one.
:::

## Reorder notice

- The minimum stock applies to the item as a whole, across all locations.
- When a consumption takes the stock below the minimum, the recipients of the vehicle log's **defect e-mail** get a message.
- Further consumption does not send another mail. Only after the stock has been topped up and falls below the minimum again is a new notice sent.

## Permissions

- **View, assign, consume:** all members of the fire brigade, or everyone with access to the operation
- **Maintain items and stock, import:** fire brigade administrators and equipment managers

## Notes

- Breathing apparatus, cylinders and masks are still managed under "Breathing apparatus", not here.
- Whether an item is booked off during an operation depends only on the "consumable" checkbox — not on the Sybos material type.
- Stock may go negative if more was consumed than the records showed. A stocktaking puts it right again.
- Stock changes are not written back to Sybos.
