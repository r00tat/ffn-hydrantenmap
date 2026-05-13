# Operations

Create, edit and manage operations here. Each operation can be linked to vehicles, personnel and other items. You can share operations via link, filter them by group and export or import the data.

![Operation overview](/docs-assets/screenshots/einsaetze.png)

## Features

- **Create new operations** With all details such as name, address, alert, arrival and departure
- **Edit operation details** Change name, address, alert, arrival, departure and other fields
- **Assign vehicles and personnel** Link vehicles and crew to the operation
- **Filter operations by group** Show only operations of a specific group or of all groups
- **Activate and switch operations** Set an operation as the active one on the map
- **Share operations via link** Anonymous access via token link, no login required
- **Export and import operations** Back up operation data or restore it from a file
- **Close and delete operations** Archive or remove finished operations (admins only)
- **Alarm SMS integration** Automatically pre-fill new operations from current alerts

## Instructions

### Create a new operation

The create button lets you add a new operation with all relevant information.

1. Click the create button (FAB) in the operation list
2. Fill in the following fields in the dialog:
   - **Name/title** – short description of the operation
   - **Group** – the fire brigade group
   - **Fire department** – the responsible fire department
   - **Alert date/time** – when the alert was received
   - **Description** – further details about the operation
   - **Arrival** – time of arrival on site
   - **Departure** – time of departure from the site
3. Click "Save" to create the operation

### Use Alarm SMS when creating an operation

If Alarm SMS credentials are stored for your group, you can pull in current alerts directly when creating an operation.

1. Open the dialog for creating a new operation
2. If Alarm SMS credentials are available for the selected group, an alert dropdown appears
3. Select the desired alert from the list
4. Data such as name, address, alert time and description are filled in automatically
5. Review the imported data and add missing information if needed
6. Click "Save"

:::info
The Alarm SMS integration automatically loads current alerts when credentials are stored for the group. Contact an admin if you would like the integration set up for your group.
:::

### Activate an operation

Only the active operation is displayed on the map. You can switch operations by activating a different one.

1. Open the operation list
2. Click the "Activate" button on the desired operation
3. The operation becomes the active one and is shown on the map
4. The previously active operation is deactivated automatically

### Edit an operation

You can edit existing operations at any time to add or correct details.

1. Open the desired operation
2. Click the pencil icon to enter editing mode
3. Change the relevant fields (name, address, times, description, etc.)
4. Click "Save" to apply the changes

### Share an operation

You can share an operation with other people via link. The link grants access without a login.

1. Open the desired operation
2. Click the share icon
3. The link is automatically copied to the clipboard
4. Send the link to the recipients (e.g. via messenger or email)
5. Recipients can view the operation via the link without logging in

:::info
The share button creates an anonymous link. Anyone with this link can view the operation without a login. Only share it with trusted people.
:::

### Filter operations

In the operation list you can filter the displayed operations by group to quickly find the right one.

1. Open the operation list
2. Use the group dropdown at the top of the list
3. Choose "All groups" to see everything or pick a specific group
4. The list is filtered immediately to show only operations of the selected group

### Export and import an operation

Operation data can be exported to back it up or transfer it to another system. Backed-up operations can be imported again.

1. **Export:** Open the desired operation and use the export function to download the operation data as a file
2. **Import:** Use the import function in the operation list to read in a previously exported file
3. After the import all operation data is restored

### Add items

1. Open an existing operation
2. Choose the item type (vehicle, person, etc.)
3. Add the item with the corresponding data
