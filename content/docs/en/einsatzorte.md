# Operation sites

Operation sites are used to manage individual locations within an operation. Each site has a status, assigned vehicles and timestamps for processing.

## Features

- Create operation sites with address and description
- **Status management with colour coding** Open (yellow), action needed (red), in progress (orange), done (green), no action (green)
- **Assign vehicles and tactical units per site** From map vehicles, tactical units or cost-recovery suggestions
- **Timestamps** Alert time, start time, completion time
- **Automatic email import of operation sites** For the FFN group, every 60 seconds
- Deduplication via order number
- GPS coordinates and map view
- Sortable by every column
- **Responsive layout** Table (desktop) or cards (mobile)

## Instructions

### Create an operation site

1. Add a new operation site
2. Enter name and address
3. Set the status
4. Save

Every new operation site — whether created on this page or on the map — appears in the operational diary.

### Change the status

1. Click the dropdown in the status column
2. Select a new status – the colour changes automatically

:::info
Tip: The status colours help with a quick overview: red = urgent, orange = in progress, green = done.
:::

### Assign vehicles and units

1. Open the vehicle dropdown on the operation site
2. Pick a vehicle or tactical unit from the list or create a new vehicle — units are marked with their kind (platoon, group, …)

If the operation site has coordinates, the vehicle or unit is moved there on the map when it is assigned.

### Layer per site

With the **Layer per site** switch at the top of the page, each operation site gets a layer of its own as soon as the first vehicle or unit is assigned to it. Assigned resources and the site's marker sit in that layer and can be shown and hidden together on the map. Anything withdrawn falls back to the **Einsatz** layer.

The switch applies to the whole operation and starts off, which keeps the layer list manageable for large operations with many sites. Switching it on applies existing assignments; switching it off keeps the layers.

Vehicles and tactical units can also be assigned on the **Operational resources** page in the **Location** column of the strength table.

### Move an operation site on the map

1. Switch the map to edit mode
2. Drag the marker of the operation site to the right spot — the new position is saved immediately

### Use email import

1. Click the email check button or wait for the automatic poll every 60 seconds
2. New operation sites appear with a badge
3. Existing orders are recognised by their order number and are not imported twice

:::info
Tip: The email import runs automatically in the background (every 60 seconds) and also creates an operation log entry for new sites.
:::

### Manage timestamps

1. Set alert time, start time and completion time for each operation site

### Sort and filter

1. Click the column headings to sort
