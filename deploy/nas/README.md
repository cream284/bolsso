# Synology NAS automatic deployment

This directory contains the fixed, privileged part of the NAS deployment.
Install it once as `root`; after that DSM Task Scheduler can pull changes from
the public `main` branch without giving GitHub access to the NAS or Docker
socket.

## One-time installation

From the project directory on the Mac:

```bash
scp -r deploy/nas bolsso-nas:/tmp/bolsso-nas-install
ssh -t bolsso-nas 'sudo /bin/sh /tmp/bolsso-nas-install/install.sh'
```

The password prompt is handled directly by `sudo` on the NAS. Never put the
DSM password in this repository or a command.

## DSM Task Scheduler

Create a **Scheduled Task → User-defined script** with these values:

- User: `root`
- Schedule: every 5 minutes
- Command: `/volume1/docker/bolsso/bin/pull-deploy.sh`

The deployer compares the GitHub commit SHA, downloads a release only when it
changed, runs a NAS-only private test suite against disposable synthetic data,
and promotes the release only when those tests pass. It then recreates the
containers so PocketBase applies every new migration, checks `/api/health`, and
restores the previous code release if the health check fails. When a private
test runner is placed beside the installer, it is installed as a required
deployment gate but is never committed to this public repository. Database
migrations should therefore be additive and
backward-compatible; code rollback does not restore a database snapshot.

Running the installer again updates only these fixed deployment files and
forces one safe container recreation. Existing NAS secrets and database files
are preserved.

## Local-only ports

- `127.0.0.1:18090`: member API through Caddy; PocketBase admin endpoints are blocked
- `127.0.0.1:18091`: direct PocketBase connection for private administration

Both ports bind only to NAS loopback. A later Tailscale Funnel configuration
should publish port `18090` only. Do not publish `18091` to the internet.

To open the admin UI through an SSH tunnel:

```bash
ssh -N -L 18091:127.0.0.1:18091 bolsso-nas
```

Then visit <http://127.0.0.1:18091/_/> on the Mac.

## Persistent and sensitive data

`/volume1/docker/bolsso/data/pb_data` and
`/volume1/docker/bolsso/secrets/runtime.env` exist only on the NAS. They are
never downloaded from or uploaded to GitHub. Back up `pb_data` separately in
DSM before importing real member or bank data.
