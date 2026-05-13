# Administration

The admin area offers advanced management features for administrators. Here you can manage users, import data and configure system settings.

## Features

- User management: view users, set permissions, assign custom claims
- Group management: create and manage groups
- Admin actions: database maintenance, user repair, copy data between environments
- GIS data pipeline: import HAR files and process geo data
- Hydrant clusters: manage and cluster hydrant data
- Hydrant CSV import: import hydrant data from CSV files
- Cost recovery settings: configure tariffs and templates
- Water levels: configure measuring stations
- Deleted items: restore deleted data
- Audit log: track all system changes

## Guide

### User management

### Manage users

1. Click "Users" in the menu
2. List of all registered users
3. Set permissions (isAuthorized, isAdmin)
4. Assign custom claims for special access rights

### Manage groups

1. Click "Groups" in the menu
2. Create/edit/delete groups
3. Store Alarm SMS credentials per group

### Admin dashboard

### Run admin actions

1. Click "Admin" in the menu
2. Tab "Admin Actions": repair user permissions
3. Fix empty operation groups
4. Set custom claims
5. Copy data between dev and prod
6. Find and clean up orphaned items

### Import GIS data

1. Tab "GIS Data Pipeline": upload HAR file
2. Choose locality and collection
3. The data is parsed, coordinates are converted and shown in a preview
4. Start import

### Import hydrants from CSV

1. Tab "Hydranten CSV Import": upload CSV file
2. Configure column mapping
3. Check preview
4. Run import

### Configure cost recovery

1. Tab "Kostenersatz": set tariffs and hourly rates according to the tariff ordinance
2. Define vehicle-specific costs
3. Configure email templates

### Manage water level stations

1. Tab "Pegelstände": register measuring stations and configure parameters

### Restore deleted items

1. Tab "Gelöschte Elemente": search deleted operation items
2. Restore individual items or delete permanently

### Audit log

### Track changes

1. Click "Audit Log" in the menu
2. Shows all system changes: who changed what and when
3. Filter by user and action

:::warning
Note: The admin area is only visible to users with administrator permission.
:::

:::info
Tip: Use the admin action "copy data" to synchronize data between the development and production environments.
:::

:::info
Tip: The audit log helps to trace changes and can be used for quality assurance.
:::
