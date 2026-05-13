# Alarm SMS

The Alarm SMS integration shows incoming fire department alerts. You can see active and past alerts with details about the alerted functions and participants.

## Features

- Show active operations and past alerts
- **Details per alert** Title, alert time, end time, creator, groups
- **Functions and participants with color-coded chips** e.g. AT (breathing apparatus), GF (group leader)
- Filter participants by function (click chip)
- Show alert location on embedded map
- **Integration when creating new operations** Automatic data transfer from Alarm SMS alerts

## Guide

### View alerts

1. Click "Alarm SMS" in the menu
2. The page shows "Active operations" and "Past alerts"

### Read alert details

1. Each alert card shows: title, alert time, end time, creator, involved groups

### View functions and participants

1. Colored chips show function types like AT (breathing apparatus), GF (group leader) with participant count
2. Clicking a chip filters the participant list by that function

### View alert map

1. If the alert has coordinates, the alert location is displayed on an embedded map

### Use an alert when creating an operation

1. When creating a new operation: if the group has Alarm SMS credentials, a dropdown with current alerts appears
2. Selecting an alert automatically fills in the operation data

:::info
Tip: Alarm SMS credentials are configured per group in the admin area.
:::

:::warning
Note: Without stored credentials for the current group, no alerts are displayed.
:::
