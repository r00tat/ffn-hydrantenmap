# Trip log

The trip log records every journey of a fire brigade's vehicles — operation, drill, supply run or other. It captures driver, times, counter readings, refuelled consumables and reported defects. Trips can be entered one at a time, submitted via QR code without signing in, or written for an entire operation in one go for all vehicles involved.

## Features

- **Record trips per vehicle** Driver, purpose, route, departure and arrival, counter readings
- **Bulk entry for an operation** All vehicles of an operation in a single pass, drivers and times prefilled from the operation
- **Automatic mileage** End reading derived from the driven route fire station → incident site → fire station
- **Counters per vehicle type** Kilometres for vehicles, engine hours and bilge pumps for boats, no counters for trailers
- **Entry without signing in** Via a group link or a QR code inside the vehicle
- **PDF export** Free choice of period and vehicles, estimated values clearly marked
- **Statistics with drill-down** Kilometres, trips, time on the road and consumption per period, purpose, vehicle and driver — from the chart down to the single trip
- **Defect management** Status *open*, *in progress*, *resolved* with resolution date and an unchangeable note history; a page across all vehicles, open-defect count on the vehicle card
- **Defects and consumables** Defect reported from within a trip, refuelled amounts per consumable
- **Master data in the admin area** Vehicles, persons, fire station location, import from cost recovery and Alarm SMS
- **PDF import** Take over trips from an earlier PDF export

## How it works

### The group as tenant

Every fire brigade (group) has its own trip log. Vehicles, persons and trips belong to the group and only its members can see them. If you belong to several groups, pick the group at the top of the page; the choice is remembered for your next visit.

### Vehicles and counters

Every vehicle has a counter preset that determines which fields a trip has:

- **Vehicle (kilometres)** One odometer with a start and an end reading
- **Boat (engine hours, bilge pumps)** Engine hours with start and end, bilge pumps as plain readings
- **Without counters** For trailers and roll-off containers — such units do not need a driver either

There are two kinds of counters: **start/end** (the start value comes from the previous trip, the end value is entered on return) and **reading** (a single value on return). For every vehicle the app remembers the latest end value — it is the start value of the next trip and is shown on the vehicle card.

### Where a counter reading comes from

A trip log is a record of evidence. Every entry therefore states whether an end reading was read off or derived:

- **Read off** Entered by hand — a manual entry is never overwritten
- **Calculated from the route** Outbound and return leg are measured separately and stored in metres on the entry
- **Estimated** From the straight-line distance with a detour factor when no routing was available — marked with "approx." in the PDF
- **Unchanged** The counter did not move (a bilge pump that never ran, for instance)

:::info
Why measure the outbound and return legs separately? Within town it makes no difference. For an operation on the motorway the return leg runs via the next exit and can differ by kilometres — a doubled outbound leg would put a wrong reading into the record.
:::

## Guide

### Open the overview

1. Open **Trip log** from the menu
2. If you are in several groups, select the group at the top
3. The cards of the active vehicles are shown first, with the last driver, the current counter readings and a button for entering a trip directly
4. **All trips** below holds the group-wide list — it can be filtered by vehicle, purpose, driver, period and "defects only"

Clicking a vehicle card opens that vehicle's page with its master data, current counter readings and its trips. That page has its own link and can be shared.

### Searching and filtering trips

A filter bar sits above the trip list, both on the overview and on a vehicle's page:

- **Search** looks at the route, destination, operation, notes, defect description, driver and vehicle. Several words all have to appear, but they may be spread across different fields. Case and umlauts do not matter: "hauptstrasse" finds "Hauptstraße"
- **From / To** narrows the list to a period. Both boundary days are included. It is the only filter that also loads older trips — without it the list shows the most recent trips, and the search works on exactly those
- **Driver** lists the drivers of the loaded trips
- **Vehicle**, **purpose** and **defects only** as before

All filters combine into an intersection; if no trip matches, the list says so explicitly. **Reset filters** clears everything.

The filter state is kept in the address bar (`?q=…&von=…&bis=…`). It therefore survives navigating back, can be bookmarked and can be handed on — the recipient sees the same excerpt.

If the chosen period covers more trips than are loaded, **Load more** appears below the list.

### Record a single trip

1. Click **New entry**, or **Add trip** on the vehicle's card
2. Pick the **vehicle** — coming from a vehicle card it is already selected. The remaining fields appear only afterwards: counters and consumables depend on the chosen vehicle
3. Enter the **driver**: suggestions come from the group's persons, free text is allowed
4. Choose the **purpose** (operation, drill, supply run, other)
5. For the purpose *operation* you can additionally select the **operation** or type it in freely
6. Enter **route / destination**, **departure** and **arrival**
7. Enter the **counter readings** — the start value is prefilled from the previous trip
8. Optional: **refuelled** (diesel, petrol, AdBlue), **notes** and **defect or fault**
9. Save the trip

:::info
**Route / destination** is mandatory — where the trip went is part of the record. The field may only stay empty when an **operation** has been picked from the list: the operation then names the destination, and both the list and the export show its name. Merely typing an operation name is not enough.
:::

:::info
If a counter reading differs from the last known value or falls below it, a hint points that out. The trip can still be saved — readings do get added or corrected after the fact.
:::

:::warning
Only the person who created an entry, or an administrator, may change or delete it. Deleted trips are kept as marked-deleted and disappear from the lists and from the export.
:::

### Report a defect

If **Defect** is ticked on a trip, a defect in status *Open* is created from it — a record of its own that from then on carries its own status, history and resolution date. The **All trips** list can be filtered to defects only. Ticking the box reveals the **defect description** field — it is mandatory, and that text goes into the notification and into the defect. The **notes** stay separate from it: they hold what was noticed in passing, the defect holds what is broken.

:::info
The defect is only created when a trip is **added**. Editing the trip later creates no second defect and does not reset one that is already being worked on — from the moment it is reported the defect is managed through the defect list. If the tick is removed later, the defect stays and has to be closed there.
:::

### Manage defects

The **Defects** page (menu → *Defects*, or the button in the trip log) is the work list: all defects of all vehicles of the group, pre-filtered to *open and in progress*. The filters show a single status or a single vehicle — decommissioned vehicles are listed too, so an open defect on one does not become unfindable.

Clicking **Edit** opens the defect:

- **Status** *Open*, *In progress* or *Resolved*. Every change is recorded in the history with author and timestamp.
- **Resolved on** appears for status *Resolved*, pre-filled with the current time and editable — for the defect fixed last week and only entered today. Reopening the defect removes the date.
- **Add note** appends an entry to the history. Notes cannot be changed afterwards, which keeps the path from report to repair traceable (“garage appointment on 12 Aug”, “spare part ordered”).
- The **defect description** can be corrected without it showing up in the history — a typo is not an event.

Every member of the group may edit: whoever works off a defect is rarely the person who reported it. Traceability comes from the history. **Deleting** is restricted to administrators and is meant for defects created by mistake — a repaired defect belongs on *Resolved*, not deleted.

**Report defect** also records a defect without a trip, for instance during the monthly vehicle check.

The vehicle card and the vehicle page show the number of open defects instead of “defect reported”; clicking it opens the defect list filtered to that vehicle. The old “defect reported” notice only appears while there are no open defects.

If recipients are configured for the group (admin area → Trip log → **Settings** → *Defect notification*), an email is sent on save: vehicle and licence plate, driver, times, purpose and destination, the counter readings, the defect description and a link to the vehicle's trip log. The first address goes into the To field, all others in copy.

:::info
The notification is only sent for a **newly recorded** trip — including a report via the QR code without login, which is then marked as submitted via the share link. A later edit, bulk entry and the PDF import do not trigger an email. Nothing is sent without configured recipients; the trip is saved either way.
:::

### Write the trip log for several vehicles of one operation

After an operation you do not need a separate dialog per vehicle: **bulk entry** creates a trip for all vehicles of the operation at once.

**Where to find it**

- On the operation detail page in the **Trip log for this operation** section (right below the crew assignment)
- Or via the **Record trips for operation "…"** button at the top of the trip log page while an operation is active

**Where the rows come from**

The app produces one row per unit of the operation: the vehicles on the operation map plus the vehicles from the crew assignment. Every unit is matched against the trip log master data by name; only what is kept there gets a row. The vehicle's **driver** is taken from the machine operator in the crew assignment — preferably via the Alarm SMS recipient ID, otherwise by name.

**How to proceed**

1. Open the **Trip log for this operation** section
2. Check the **times for all vehicles** at the top: prefilled are the earliest alert and the latest departure from site of the vehicles involved, so the span covers every individual trip
3. Check the prefilled **driver** in each row and correct it where needed
4. The mileage preview per row shows `start → end (+difference)`. An "approx." means the end reading is only calculated on save
5. If a single vehicle needs different times or its own counter readings, expand the row via **Edit details**
6. Click **Save all**

**What happens on save**

Every complete row becomes a trip with the purpose *operation*, linked to the operation; the operation name is used as route/destination. Missing mileage end readings are calculated by the server from the route from the fire station to the incident site and back — the same distance for all vehicles. Other start/end counters are carried over as unchanged, reading counters take the last known value.

The result message states how many trips were saved and the mileage entered per vehicle — and separately what was not written: incomplete rows including the reason, vehicles that someone else recorded in the meantime, and trips that could not be saved and have to be added by hand.

:::info
Normally only the end readings need to be entered — vehicles, machine operators and times come from the operation, the start readings from the previous trip.
:::

:::info
Vehicles already recorded carry the **Already recorded** marker and are not written again. Clicking *Save all* a second time therefore does not create duplicates. Use the pencil icon in the row to open an existing entry.
:::

:::warning
A vehicle of the operation that is missing from the trip log master data gets no row. The names of those units are listed as a hint below the list (*"Not in the logbook master data, so no trip is recorded"*). For a roll-off container that is correct — if a real vehicle appears there, its name is spelled differently in the master data or the vehicle has not been created yet.
:::

**Requirements for automatic mileage**

- The operation belongs to a group and you are a member of that group
- The operation has coordinates (incident site on the map)
- The **fire station location** is maintained in the group's trip log settings — otherwise the default location is used
- The vehicle has an odometer with a known start reading

If routing is unavailable, the distance is estimated from the straight line and the trip is marked as estimated. If coordinates are missing entirely, the end reading stays empty and has to be entered.

### Record a trip without signing in (QR code)

For trips by people without app access there is one trip log link per group:

1. An administrator creates the link in the admin area under **Trip log → Trip log link**
2. A QR code can be generated, downloaded and printed there for every vehicle — it preselects that vehicle in the form and is meant as a sticker inside the vehicle
3. Whoever scans the code fills in the same form as in the app — without signing in

:::warning
Anyone holding this link can record trips. Existing entries are **not** visible through the link. Regenerating or deleting invalidates the previous link immediately — QR codes already printed stop working.
:::

### Export as PDF

1. Click **PDF export** on the trip log page
2. Choose the **period** — prefilled is the current year up to today
3. Select the **vehicles**; decommissioned vehicles are marked as such and can be included for past periods
4. Click **Create PDF**

The PDF contains one table per vehicle with date, time, driver, reason, purpose/route, notes, counter readings and consumables. Estimated values are prefixed with "approx." and explained in the legend. Very large periods are rejected — export those in smaller sections.

### Analyse the statistics

The **Statistics** button on the trip log page opens the analysis; from a vehicle card it starts with that vehicle as a filter.

1. Choose the **period** at the top — the current year by default, plus presets for month, quarter, last year, last 12 months or a freely set period
2. The **key figures** show trips, totals per counter (kilometres, operating hours), time on the road, refuelled amounts, average kilometres per trip, average consumption and defect reports
3. In the **over time** chart you choose which figure is shown (trips, distance, operating hours, time on the road, refuelled amount), how it is split (purpose, vehicle, driver) and at which granularity (day, week, month, year)
4. Below that are the distribution **by purpose**, the ranking **by vehicle** and the distribution **by weekday**
5. The **drivers** table is sortable: trips, kilometres, operating hours, time on the road, vehicles used and last trip
6. **Operating fluids and consumption** shows the refuelled amounts over time and the approximated consumption per vehicle

**Drill-down:** Clicking a bar in the over-time chart narrows the period to that section and steps the granularity down one level — from year through month to day. Clicking a segment of the purpose distribution, a bar of the vehicle ranking or a row of the drivers table sets the respective filter. All active filters appear as chips above the charts and can be removed individually or via **Reset filters**. At the very bottom, **trips in selection** lists the trips currently being analysed — the way from the chart to the individual entry.

:::info
How exact are the figures? Only counters with a start and an end reading are summed; a plain reading (a bilge pump, for instance) yields no difference and enters no total. If a trip has no end reading, it is missing from the distance total — the analysis states the number of such trips and the number of trips with estimated readings below the key figures. Consumption is an approximation: a tank fill also covers trips outside the period. The figure is useful over a year, not over a week.
:::

### Maintain master data (admins only)

The admin area under **Trip log** has five tabs:

- **Vehicles** Name, registration, active/decommissioned, counter preset, consumables, note. **Import vehicles** takes the vehicles over from the cost recovery inventory; the per-vehicle QR code lives here as well
- **Persons** The group's drivers with phone, email and Alarm SMS recipient ID. **Import persons from CSV** reads the participant export from Alarm SMS; persons no longer contained can be deactivated — nothing is deleted, so past trips stay attributed
- **Settings** The fire station location as the starting point for operation mileage, via coordinates or by picking it on the map; below it the **defect notification** with the email recipients for reported defects, and the **defect import** that creates an open defect from every existing trip that reported one (running it again creates no duplicates)
- **Trip log link** Create, regenerate or delete the link for entry without signing in
- **Trip log import** Take over trips from a PDF export

:::info
Decommissioned vehicles and deactivated persons disappear from the selection lists; their existing trips are kept and remain exportable.
:::

### Import trips from a PDF

1. Open **Trip log → Trip log import** in the admin area
2. Choose the PDF file — it is read in the browser and not uploaded
3. Assign the vehicle if it cannot be derived from the title
4. Check the list: every row is marked as *ready*, *already present*, *needs review* or *unknown driver*
5. Faulty rows can be corrected via **Edit** — the correction applies to this import only
6. Click **Import**

Unknown drivers are created as deactivated persons so the trip has a driver without cluttering the selection lists. Trips already present are skipped, so repeating an import does not create duplicates.

## Permissions

- **See and record trips** Members of the respective group
- **Bulk entry for an operation** Members of the group the operation belongs to
- **Change or delete a trip** Only the creator of the trip or an administrator
- **Entry via the QR code** Anyone holding the link — recording only, no insight into existing trips
- **Master data, trip log link and import** Administrators only
