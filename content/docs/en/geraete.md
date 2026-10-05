# Equipment & supplies

"Equipment & supplies" holds your fire brigade's equipment and stock items — taken over from Sybos, with the stock per storage location. During an operation you can assign equipment and record consumables (e.g. protective suits, filters, absorbents); consumption is booked off the stock automatically. When the stock falls below the minimum, a "please reorder" notice is sent.

## Features

- **Item list:** all equipment and stock items with storage locations and total stock, filterable by class, location, consumable and "below minimum"
- **To reorder:** items whose stock has fallen below the minimum
- **Stock per location:** vehicle and compartment (e.g. "SRF · GR 2"), room (e.g. "Fire station · Storage") or a container (e.g. "Oil booms 1")
- **Receipt, transfer, stocktaking:** top up stock, move it between locations or set the counted value
- **Import from Sybos:** item export as an Excel file, with a preview before applying
- **Sets:** several items of equipment and supplies as one bundle (e.g. "oil spill"), recorded in an operation with one click or scan
- **During an operation:** assign equipment and consume supplies, even without a connection

## Instructions

### During an operation: assign equipment or consume supplies

1. Open the "Equipment & supplies" section of the operation
2. Search for the item and click it — by name, inventory number, barcode, serial number, but also by type or class (e.g. "gas detector"). Below each match you see model, serial number and location, so items with the same name can be told apart; once selected, the dialog shows the master data from Sybos
3. For equipment, enter the quantity or hours — the stock does not change
4. For consumables, enter the quantity and choose the location it was taken from
5. Save — the entry shows up in the operation immediately

Several items at once: the list stays open after a click, so you can pick more items right away. **"Record …"** adds all of them — equipment assigned, consumables with quantity 1 from the suggested location. Add quantity, hours or location afterwards via **Edit** on the entry if needed. Items already recorded for the operation are marked "already in this operation".

:::info
Without a connection the entry is stored on the device. Booking it off the stock happens as soon as the connection is back. Until then the entry is marked as "not yet booked".
:::

If a consumption is changed or deleted later, the stock is corrected accordingly.

The same list is also on the **operation overview** as the collapsible section "Equipment & supplies".

### During an operation: record a set

1. In the **Record** dialog, search for the set's name — sets are listed below the items and marked "Set" — or scan the code of the set or its set box
2. The preview shows every entry that will be created. Quantity, hours and location can be changed per row. Greyed-out rows are not created; the reason is shown next to them (e.g. "inactive")
3. Add further sets or single items if needed
4. Save with **"Record …"**

In the operation's list the entries appear under the heading "Set ‹name›", which can be collapsed. Single entries stay editable; the menu on the heading offers **Remove whole set**, which removes all entries of this set at once — consumed supplies are booked back to stock.

### Maintain sets

1. In "Equipment & supplies", open the **Sets** tab and choose **New set** (or click an existing one)
2. Enter a name and add the contents via the item search. Enter the quantity per item and, for consumables, a fixed location if needed. Without a fixed location — or if it no longer exists — the matching location is suggested as for single items
3. Optionally choose the **Sybos set item** (e.g. the oil spill box). It is recorded along with the set in an operation, and its barcodes find the set automatically
4. Enter or scan your own **codes**, such as a QR sticker on the box. A code must not already belong to an item or another set
5. Save. Switch a set that is currently not in use to inactive — it then no longer appears in operations

### Maintain stock

1. Open "Equipment & supplies" in the menu
2. Select an item
3. At the location, choose **Receipt** (supplies arrived), **Transfer** (e.g. from storage to the SRF) or **Stocktaking** (enter the counted value)
4. Whether an item is a **consumable** is switched directly in the item with the switch at the top. Sybos does not export this, so after an import every item is a device. For many items at once: click **Select** in the list, click the items (or narrow them down with search and filters and use **Select all …**) and choose **Mark as consumable**. Under **Edit**, enter a **unit** and a **minimum stock** if needed. Below are all master data from Sybos; for imported items the next import overwrites them again
5. Add another location with **New storage location**. You can choose room, vehicle or **container**; containers are the items of the Sybos category "Container" and have to be imported first
6. The pencil edits a location, the bin deletes it. Any remaining stock is booked out. If an operation used material from the location, it is only hidden so the operation still shows it

### Import from Sybos

1. Create the item export in Sybos as an Excel file (one row per item and location) — **including the location columns**. Without them the import only takes over master data and leaves the stock as it is. Import containers (roll containers, pallets) from their own export of the category "Container" as well
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
- **Maintain items, stock and sets, import:** fire brigade administrators and equipment managers
- **Choose sets in an operation:** members of the fire brigade; guests of an operation record single items

## Notes

- Breathing apparatus, cylinders and masks are still managed under "Breathing apparatus", not here.
- Whether an item is booked off during an operation depends only on the "consumable" checkbox — not on the Sybos material type.
- Stock may go negative if more was consumed than the records showed. A stocktaking puts it right again.
- Stock changes are not written back to Sybos.
