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
| `call` | Emergency operations (Einsätze). Access is restricted to users whose `groups` claim includes the firecall's group, plus guests holding a `firecall` claim for this operation. Subcollections store items, history, layers, and kostenersatz calculations. |
| `call/{id}/kostenersatz` | Kostenersatz calculations. **Excluded from the `{subitem=**}` wildcard**; only `hasPerm(<group of the firecall>, 'kostenersatz.use')`, never guests. |

### Kostenersatz (Cost Recovery)

| Collection | Description | User with `kostenersatz.use` | Admin |
|------------|-------------|-------------|-------|
| `kostenersatzVersions` | Rate versions (e.g., LGBl 77/2023), global | Read (`hasPermAny`) | Read/Write |
| `kostenersatzRates` | Individual rate items per version, global | Read (`hasPermAny`) | Read/Write |
| `kostenersatzTemplates` | Saved calculation templates, global | Read, Create, Update/Delete own (`hasPermAny`) | Full access |
| `kostenersatzVehicles` | Vehicle definitions with rate mappings | Read (every authorized user) | Read/Write |
| `groups/{g}/kostenersatzConfig` | Email templates per group | Read (`hasPerm(g, …)`) | Read/Write |
| `groups/{g}/atemschutzRechnung`, `atemschutzEmpfaenger`, `atemschutzConfig` | Billing of cylinder fillings per group | Read (`hasPerm(g, …)`) | Read/Write |

### User Management

| Collection | Description |
|------------|-------------|
| `user` | User profiles with authorization flags and group roles (`groupRoles`, derived `groupPerms`/`permsAny`). Users can only read their own profile; only `writeUserRoles()` on the server writes the role fields. |
| `tokens` | FCM push notification tokens. Users can only access their own tokens. |

### Other

| Collection | Description |
|------------|-------------|
| `assistants` | AI assistant configurations |

## Permission Model

A user is a member of a group and holds **roles in that group**; a role is a
bundle of **permissions** defined in code (`src/common/permissions.ts`). The
background, in German, is in [docs/berechtigungen.md](../docs/berechtigungen.md).

The security rules use these helper functions:

- **`authorizedUser()`**: User is authenticated AND either has an `@ff-neusiedlamsee.at` email OR has `authorized == true` in their token claims.
- **`adminUser()`**: User is authenticated AND has `isAdmin == true` in their token claims.
- **`member(g)`**: `authorizedUser()` AND `g` is in the `groups` claim AND `g` is not the pseudo-group `allUsers`. Membership lives in the claim because it is evaluated by nearly every rule and listener, also offline.
- **`hasPerm(g, p)`**: `adminUser()` OR (`member(g)` AND permission `p` is in `user/{uid}.groupPerms[g]`, read via `get()`).
- **`hasPermAny(p)`**: `adminUser()` OR (`authorizedUser()` AND `p` is in `user/{uid}.permsAny`). For global collections without a group in the path.

Feature permissions (clothing, Kostenersatz, billing) are deliberately **not**
custom claims: they are read rarely, revoking them takes effect without a token
refresh, and claims are limited to 1000 bytes. Only the rules read `groupPerms`
and `permsAny`; server and client compute from `groupRoles` and the catalog.

Firestore ORs matching `match` blocks, so a stricter nested block cannot
narrow a broader wildcard. That is why `{subitem=**}` under `call/{doc}`
excludes `kostenersatz` explicitly instead of relying on a separate block.

**Keep `dev/` and `prod/` identical.** A test checks this
(`firebase/rulesIdentical.test.ts`, part of `npm run test`).

## Testing Rules

```bash
npm run test:rules
```

Runs `firebase/*.rules.test.ts` against the Firestore emulator
(`firebase/firebase.rules-test.json`: Firestore only, port 8181, project
`demo-hydranten-rules`). The tests load the **prod** rules; dev is covered by
the identity test above. Requires the firebase CLI and Java (21 or newer; if
the default JDK is older, prefix `JAVA_HOME=$(/usr/libexec/java_home -v 21)`).

Always start it through `npm run`: the script calls vitest via
`$npm_node_execpath`, because the standalone firebase binary puts its own
Node 20 first in `PATH`, under which vitest fails with `ERR_REQUIRE_ESM`.
The rules tests are not part of `npm run test` and not run in CI.

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
