# Operational resources

The operational resources page gives an overview of all vehicles and resources deployed on an operation, including crew strength calculation and a grouped view.

## Features

- Overview of all deployed vehicles and resources
- **Quick entry** for further vehicles and tactical units right on the page
- **Strength table** With total crew size and breathing apparatus wearers (ATS)
- Grouping by layers
- Compact card view for each vehicle
- CSV export of all operational resources
- Edit vehicles and view details
- Drag & drop for layer assignment

## Instructions

### Open the operational resources overview

1. Click "Operational resources" in the menu
2. The page shows all vehicles of the active operation

### Quickly add further resources

Above the strength table there is an input row to record arriving resources without opening a dialog.

1. Choose **Vehicle** or **Tactical unit**
2. Enter the **Name** — for vehicles your own fleet is suggested, any other name works too
3. Optionally fill in **Fire brigade / organisation**, strength and **SCBA**
4. Press **Enter** or click **Add**

The cursor then returns to the name; fire brigade, **External** and **Arrived** are kept, so several vehicles of a neighbouring brigade can be typed one after another.

- **Crew 1:?** on a vehicle is the crew without the commander — `8` or `1:8` means nine people
- **Strength** on a tactical unit is the total strength — `9`, `1:8` or `1/8/9` mean nine people
- **External** switches on as soon as another brigade than your own is entered, and can be toggled
- **Arrived** sets the arrival time to now, otherwise the alert time is set to now — so every new vehicle and unit appears as "alerted" or "arrived" in the operational diary
- Your own vehicles can also be added with one click on their chip

The new item is placed at the incident address. Alarm time, description or position can be added afterwards via **Edit**.

### Read the strength table

1. At the top of the page: total number of vehicles, total crew, ATS wearers
2. Calculated automatically from all vehicle data

:::info
Tip: The strength table updates automatically when vehicles are added or crew sizes change.
:::

### Filter the strength table

1. Type into the search field above the strength table, e.g. the name of a fire brigade or a vehicle
2. The search ignores case and looks at **name**, **FW**, **type** and **location**
3. Several words must all match: `Neusiedl TLF` finds only the TLF from Neusiedl
4. Use the **×** in the search field to clear the filter

:::info
The total rows only add up the rows shown — filtering for one fire brigade shows its strength. The print view and the CSV export always contain all resources.
:::

### Count crew and ATS wearers automatically

1. Assign people to a vehicle on the crew board (operation details)
2. The crew size is derived automatically from the number of assigned people
3. Every assigned person with the function "Atemschutzträger" (ATS) counts as an ATS wearer

:::info
A value entered manually on the vehicle for crew size or ATS wearers always takes precedence.
Only when no value is set are they counted automatically from the crew assignment — handy for
vehicles of other fire brigades without a crew assignment.
:::

### Edit in the strength table and assign to locations

1. The pencil at the end of each row opens the edit dialog of the vehicle or unit
2. If the operation has locations, the **Location** column shows where the vehicle or unit is deployed
3. Pick a location in the selection — **no location** removes the assignment

A vehicle or unit is always at **one** location only: picking another one withdraws it from the previous one. If the location has coordinates, it is moved there on the map. Every assignment and withdrawal is written to the operational diary, as on the **Locations** page.

### View vehicles by layer

1. Vehicles are grouped by layer
2. Each group can be expanded or collapsed
3. "Not assigned" contains vehicles without a layer

### Edit a vehicle

1. Expand the vehicle card
2. Click the edit button
3. Change details and save

### Mark a vehicle of another organisation

On a situation map with ambulances, police and neighbouring brigades, a row of red bars is hard to tell apart. A vehicle can therefore be coloured.

1. Open the vehicle for editing
2. Turn on the **Fremdorganisation** switch — the bar on the map turns blue instead of red and the popup marks the vehicle as belonging to another organisation
3. Under **Farbe** any other colour can be picked instead, for example one per organisation

In the strength table such resources are kept apart from your own: as soon as one vehicle is marked as belonging to another organisation, the table splits into **Eigene Kräfte** (own forces) and **Fremdkräfte** (other organisations), each section gets its own subtotal and the grand total is shown below. The CSV export carries a **Kräfte** column with `eigen` or `fremd`.

:::info
Without such vehicles the strength table stays as it was: one list with one total row.

The switch sits on the vehicle. A tactical unit without a vehicle therefore counts towards your own forces.
:::

### Export as CSV

1. Click the download button in the top right
2. The CSV file contains all vehicle data with a timeline

:::info
Tip: The operational resources page shows the same vehicles as the vehicles page but offers a more compact overview with crew strength calculation.
:::
