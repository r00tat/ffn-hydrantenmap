# Vehicles

Manage the vehicles in an operation with crew strength, timestamps and map positions. The vehicle management is the basis for the strength table and automatically creates operation log entries.

![Vehicle overview](/docs-assets/screenshots/fahrzeuge.png)

## Features

- **Add vehicles to the operation** With name, fire department and crew strength
- **Manage timestamps** Record alert, arrival and departure
- **Crew strength in the "1:4" format** Group leader : crew – automatically included in the strength table
- **Record number of breathing-apparatus wearers (ATS)** Listed separately in the strength table
- Show and move vehicle positions on the map
- **Strength table with total crew size** Automatic calculation across all vehicles
- Grouping by layers
- **CSV export of all vehicle data** Including a timeline with all timestamps
- **Automatic operation log entries** Changes to timestamps automatically create entries in the operation log

## Instructions

### Add a vehicle

1. Enable editing mode on the map
2. Click the plus button and choose the vehicle type
3. Enter the name, e.g. "TLFA 2000"
4. State the fire department the vehicle belongs to
5. Enter the crew in the "1:4" format (group leader : crew)
6. Enter the number of breathing-apparatus wearers (ATS)
7. Save the vehicle

:::info
Tip: The crew format "1:8" means 1 group leader and 8 crew members. The strength table calculates the total size automatically.
:::

### Set timestamps

1. Open the desired vehicle
2. Enter date and time for **alert**, **arrival** and **departure**
3. The timestamps are automatically added as entries in the operation log

:::info
Tip: Changing timestamps (alert, arrival, departure) automatically generates corresponding entries in the operation log.
:::

### Read the strength table

The strength table is shown at the top of the vehicles page. It contains the total number of vehicles, the total crew size and the number of ATS wearers.

### Position a vehicle on the map

1. Enable editing mode
2. Drag and drop the vehicle to the desired position on the map

### Export as CSV

1. Click the download button in the vehicle overview
2. The CSV file with all vehicle data and timestamps is downloaded

### Group vehicles by layer

1. Vehicles can be assigned to different layers
2. Grouping provides a clearer overview for larger operations with several sections
