---
name: Row-scoped roles need GET filtering too
description: A role restricted to a subset of rows (e.g. by country/company/owner) needs server-side filtering on read endpoints, not just write endpoints.
---

Rule: when a role is meant to operate only on a subset of a table's rows (e.g. city_manager scoped to one country, transport_manager scoped to one company), enforce that scope on GET/list endpoints too — filter server-side by the role's ownership key before returning results. Do not rely on the frontend filtering a full unfiltered payload client-side; that only hides data in the UI, it doesn't stop the API from returning it to anyone who inspects network traffic.

**Why:** Caught in code review — a new city_manager dashboard correctly scoped POST/PATCH/DELETE to the manager's own country, but the underlying GET endpoint still returned all rows across every country, with the new page filtering down client-side. That let any authenticated city_manager fetch full cross-country master data straight from the API.

**How to apply:** When adding a new row-scoped role to a shared table, check every verb on that resource (GET included). Resolve the role's scope key (e.g. profile.countryCode → countryId) and filter the query/response for that role before sending it — mirror whatever allowlist/ownership check you already added on the write path.
