# Dev permissions: .next EACCES root cause and fix

This project runs Next.js route typegen before `tsc`. If `.next` (or `.next/types`) is owned by `root`, `next typegen` fails with:

```
Error: EACCES: permission denied, open '<repo>/.next/types/routes.d.ts'
```

## Root cause
- `.next` was created by a process running as `root` (e.g. Docker container running as root, or a local `sudo` command).
- Later you run `npm run typecheck` on the host as a normal user, and `next typegen` cannot write into `root`-owned `.next`.

## Fix now
- Re-own the directory (safe, it only contains build artifacts):
  - `sudo chown -R $(id -u):$(id -g) .next`
- Or clean artifacts: `rm -rf .next` (recreated automatically).

Additionally, we added a guard that runs before typegen:
- `scripts/dev/ensure-writable-next-dir.js` checks writability and prints remediation if needed.

## Prevent recurrence
- Docker dev service runs with host UID/GID:
  - In `docker-compose.yml` we set:
    - `user: "${UID:-1000}:${GID:-1000}"`
    - and pass `HOST_UID`/`HOST_GID`
- Ensure your environment exports `UID`/`GID` (Compose uses environment variables, not shell-only vars):
  - `export UID=$(id -u); export GID=$(id -g)`
  - or create a `.env` with:
    - `UID=1002`
    - `GID=1002`

Notes
- Dev compose uses a named volume for `/app/.next` to speed up rebuilds; host `.next` should normally not be touched by the container, but running tools locally can still create it.
- Avoid running Next/Node commands with `sudo` in the repo.
