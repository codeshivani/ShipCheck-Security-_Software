# ShipCheck integrated frontend

The login/register UI and profile dashboard from the supplied frontend ZIPs are now connected to the ShipCheck Next.js app.

## Routes
- `/` — existing ShipCheck scanner dashboard
- `/login` — login/register frontend
- `/profile` — connected profile, scan history, saved repositories, score trend and vulnerability breakdown

## Connections
- A successful `/api/scan` result is saved in browser localStorage and appears in Profile > Scan History.
- Repository URLs from successful scans appear under Saved Repositories.
- `Scan Again` sends the repository back to the main ShipCheck scanner.
- `/api/rescan` updates the saved scan and resolved count.
- Profile edit data is persisted locally.
- Login/register UI persists a demo user locally and routes into ShipCheck.
- Dashboard/Profile navigation is shared through `AppNav`.

## Important
The supplied login page did not include a real authentication backend, so this integration keeps authentication as a frontend/localStorage demo. ShipCheck's actual scanner/API remains unchanged.
