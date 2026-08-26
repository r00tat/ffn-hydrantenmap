# Connecting the operations map to Claude (MCP)

The operations map can be attached to Claude as a **custom connector** — and
likewise to Claude Code, Claude Desktop or your own scripts. Access then runs
under your own sign-in and with your own permissions: what you may not see in
the operations map, Claude does not see either.

The interface is called **MCP** (Model Context Protocol). The server address
is:

```text
https://<address of the operations map>/api/mcp
```

## Before you connect

The data retrieved **leaves the operations map**. It is processed by the
connected application — for Claude that is a provider based in the USA. This
can include the names of crew members and callers.

**Fahrtenbuch (driver's log) and Kostenersatz (cost recovery) are not reachable
over MCP**: they hold personal data whose transfer to an external AI provider
would need to be settled separately.

**Firecall guests** (access through a shared link) cannot connect.

## Setting it up in Claude

1. In Claude, go to **Settings → Connectors** and add a custom connector.
2. Enter `https://<address of the operations map>/api/mcp` as the address.
3. Claude redirects you to the operations map. Sign in as usual.
4. A screen lists what Claude will be allowed to do. Check the list and
   confirm.
5. Back in Claude the connector is connected.

The first time you connect, the operations map asks for your consent. Next time
the question is skipped — unless the application asks for more than before.

## Setting it up in Claude Code

```bash
claude mcp add --transport http einsatzkarte https://<address of the operations map>/api/mcp
```

The browser opens for sign-in on the first call.

## What Claude can do with it

**Read**

- List operations and read their master data
- Read items on the map: vehicles, markers, nozzles, hose lines, areas
- Read the operational diary and the business logbook, page by page
- Fetch the full context of an operation in a single call
- Search hydrants and water supply points nearby
- Search addresses

**Calculate** (no access to operational data)

- Water relay: pump demand over distance and elevation difference
- Shuttle traffic: cycle time, sustainable flow, number of vehicles needed
- Sandbag demand for a dam section per the LU TE3 training material
- Radiation protection: inverse-square law, shielding factor, stay time,
  nuclides

**Write** (only when enabled)

- Create entries in the operational diary and the business logbook
- Create, change and delete items

Everything written through MCP is marked as such: diary and logbook entries
carry an “AI” chip naming the application, and the operation's audit log
records who wrote what with which application.

Two ready-made tasks come with it: **operation summary** and **social media
post**. The operations map's user documentation is available to Claude as well —
it answers questions about how to use the app from that.

## Revoking access

**Connected applications** (in the menu under “Administration”) lists every
application you have granted access to. *Revoke access* ends it.

An access token already issued expires within one hour at the latest; until
then a revoked application may in the worst case still read. After that it is
over — it can no longer renew its access.

## When it does not work

- **Claude cannot find the server.** The address must be the public address of
  the operations map and end in `/api/mcp`.
- **“Not authorized” after signing in.** Your user is not enabled in the
  operations map, or you are signed in as a firecall guest.
- **Claude sees no writing tools.** Writing is not enabled on this instance, or
  you only confirmed read permissions when connecting. Connect again in that
  case.
- **An operation is missing from the list.** It belongs to a group you are not
  a member of — the same rule as in the operations map itself.
