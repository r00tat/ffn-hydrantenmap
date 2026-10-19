# Administration

The admin area offers advanced management features for administrators. Here you can manage users, import data and configure system settings.

## Features

- User management: view users, authorize them, assign them to fire brigades
- Members and roles: assign roles per fire brigade (group admin, equipment officer, clothing officer, cost recovery)
- Permissions: migration of the roles and "Recompute permissions"
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
2. The overview shows the groups as a tree: sub groups are indented below
   their parent group and can be expanded and collapsed. The search field
   filters by name and description.
3. Create, edit or delete groups; the dialog also sets the **parent group**
   and stores the Alarm SMS credentials
4. Clicking a group opens its **detail page** with parent group, sub groups,
   "Edit" and the members with their roles. The navigation line at the top
   leads back to the overview.

Members of a sub group automatically become members of all parent groups. In
a user's group selection these groups are checked and locked as long as the
sub group is selected.

### Assign roles

Roles always apply **within one fire brigade**. They are assigned in the
"Members and roles" view of the brigade:

- **Group admin** Administration of the brigade: settings, share links,
  breathing apparatus administration; includes equipment officer and clothing
  officer, but not cost recovery
- **Equipment officer** Correct the trip log, vehicles, people, equipment &
  material
- **Clothing officer** View and maintain clothing
- **Cost recovery** Cost recovery for the brigade's operations, billing of
  cylinder fillings

Administrators assign every role and add users to brigades. Group admins
assign the other roles within their brigade — but only roles whose
permissions they hold themselves, and never the group admin role.

### Migrate permissions

The **Permissions** page (`/admin/berechtigungen`) converts the former role
fields into roles per fire brigade. Run it right after the change has been
rolled out — until then the brigade features are locked.

1. Check the **preview**; for cost recovery, decide per brigade where the role
   applies
2. **Migrate** — the old fields stay unchanged
3. **Remove old fields** only once the release has proven itself

**Recompute permissions** reconciles the stored permissions of all users with
the current role catalog.

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
