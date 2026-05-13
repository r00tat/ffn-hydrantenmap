# Map

The map shows hydrants and other important points in the operation area. You can pan, zoom and toggle different layers. In editing mode you can place items on the map and use drawing tools.

![Map view](/docs-assets/screenshots/karte.png)

## Features

- **Show hydrants and view details** Click a marker to see information such as type, flow and location
- **Pan and zoom the map** Touch gestures on mobile, mouse wheel and drag on desktop
- **Different base maps** Orthophoto, Basemap, Basemap grey, OpenStreetMap, OpenTopoMap
- **Overlay layers** Operation sites, distance, radius, position, power outages, water levels, weather stations, addresses
- **WMS layers** Floods, risk zones, inundation areas (provided by the state of Burgenland)
- **Search a location** Enter an address or place name and view it on the map
- **Editing mode with drawing tools** Place items on the map, draw lines and polygons
- **Place items on the map** Add vehicles, markers, lines and areas to the active operation

## Instructions

### View hydrants

Hydrants are shown as coloured markers on the map. Depending on the zoom level, nearby hydrants are combined into clusters. When you zoom in the clusters resolve into individual markers.

1. Open the map via the menu or the home page
2. Hydrants are shown automatically as coloured markers
3. Zoom into the desired area to see individual hydrants
4. Click a hydrant marker to open a popup with details such as type, flow and exact position

### Switch base map and layers

The map supports different base maps and additional overlay layers that you can toggle as needed.

1. Click the layer icon in the top right of the map
2. Choose the desired map view under "Base map":
   - **Orthophoto** – satellite imagery
   - **Basemap** – standard map view
   - **Basemap grey** – discrete, grey map view
   - **OpenStreetMap** – community map with many details
   - **OpenTopoMap** – topographic map with contour lines
3. Enable or disable overlays via the checkboxes:
   - **Operation sites** – markers of past and active operations
   - **Distance** – shows distance lines between points
   - **Radius** – circle around a selected point
   - **Position** – your current GPS location
   - **Power outages** – current power outage areas
   - **Water levels** – water levels at measurement stations
   - **Weather stations** – weather data in the area
   - **Addresses** – address points on the map
4. The selection is saved and restored on the next visit

:::info
The WMS layers (floods, risk zones, inundation areas) are provided by the state of Burgenland and show current geodata.
:::

### Search a location

The search function lets you quickly navigate to a specific address or place on the map.

1. Click the search field or the magnifying glass icon on the map
2. Enter an address, place name or label
3. Pick a result from the suggestion list
4. The map zooms to the found location and shows a marker

### Use editing mode

In editing mode you can add, move and edit items belonging to the active operation on the map.

1. Click the pencil icon in the toolbar to enable editing mode
2. Click the plus button to add a new item
3. Choose the desired item type (e.g. vehicle, marker, line, area)
4. Place the item on the map by clicking the desired position
5. Existing items can be selected by clicking and then edited or moved

:::info
Only enable editing mode when you want to make changes. In view mode the map responds more quickly.
:::

### Drawing tools

In editing mode various drawing tools are available so you can draw lines, areas and markings directly on the map.

1. Enable editing mode (pencil icon)
2. Pick one of the 8 available colours for your drawing
3. Set the desired line thickness (3 levels: thin, medium, thick)
4. Draw lines or areas by clicking on the map
5. Use **Undo** and **Redo** to revert or replay drawing steps
6. Click **Done** to save the drawing or **Cancel** to discard it

### Measure distance

The distance overlay lets you measure distances between points on the map.

1. Open the layer selection via the layer icon in the top right
2. Enable the **Distance** overlay
3. Click the start point on the map and then the end point
4. The measured distance is shown on the map
