# Firebase Configuration

This folder contains Firestore security rules for the dev and prod environments.

## Firestore Collections

### Map Data (Read-only for authorized users)

| Collection | Description |
|------------|-------------|
| `hydrant` | Fire hydrant locations and metadata |
| `saugstelle` | Suction points (water sources) |
| `loeschteich` | Fire ponds |
| `risikoobjekt` | Risk objects (buildings with special hazards) |
| `gefahrobjekt` | Hazardous material objects |
| `clusters` / `clusters6` | Geohashed hydrant clusters for map performance |

### Firecall Data (Group-based access)

| Collection | Description |
|------------|-------------|
| `call` | Emergency operations (Einsätze). Access is restricted to users whose groups include the firecall's group. Subcollections store items, history, layers, and kostenersatz calculations. |

### Kostenersatz (Cost Recovery)

| Collection | Description | Normal User | Admin |
|------------|-------------|-------------|-------|
| `kostenersatzVersions` | Rate versions (e.g., LGBl 77/2023) | Read | Read/Write |
| `kostenersatzRates` | Individual rate items per version | Read | Read/Write |
| `kostenersatzTemplates` | Saved calculation templates | Read, Create, Update/Delete own | Full access |
| `kostenersatzVehicles` | Vehicle definitions with rate mappings | Read | Read/Write |
| `kostenersatzConfig` | Email settings (from address, CC, templates) | Read | Read/Write |

### User Management

| Collection | Description |
|------------|-------------|
| `user` | User profiles with authorization flags. Users can only read their own profile. |
| `tokens` | FCM push notification tokens. Users can only access their own tokens. |

### Other

| Collection | Description |
|------------|-------------|
| `assistants` | AI assistant configurations |

## Permission Model

The security rules use two helper functions:

- **`authorizedUser()`**: User is authenticated AND either has an `@ff-neusiedlamsee.at` email OR has `authorized == true` in their token claims.
- **`adminUser()`**: User is authenticated AND has `isAdmin == true` in their token claims.

### Catch-all Rule

```javascript
match /{document=**} {
  allow read, write: if adminUser();
}
```

This grants admins full access to all collections, including any not explicitly listed above.

## Deploying Rules

```bash
./firebase-tools deploy --only firestore:rules
```

Note: The `firebase-tools` binary in the project root should be used for deployments.
