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
- Schedule: every 1 minute
- Command: `/volume1/docker/bolsso/bin/pull-deploy-every-2min.sh`

DSM does not offer a two-minute interval for script tasks. The one-minute task
uses the wrapper above, which exits immediately on odd-numbered minutes and
runs the existing deployer only on even-numbered minutes. GitHub is therefore
checked every two minutes while DSM remains the owner of the schedule.

The deployer compares the GitHub commit SHA, downloads a release only when it
changed, runs a NAS-only private test suite against disposable synthetic data,
and promotes the release only when those tests pass. It then recreates the
containers so PocketBase applies every new migration, checks API and converter
health and anonymous access restrictions. Before changing a running release it
stops services and saves a private recovery snapshot of data, files, configuration
and images. Internal failure restores that snapshot; interrupted recovery blocks
new deployments until resolved. Writes are blocked during verification.
External checks also run against the frontend's API origin;
a failed external check is retried on the next schedule without redeploying.
The NAS-only test runner is required. Install the complete private test bundle;
none of its fixtures belong in this public repository. Keep migrations additive
where possible. Recovery snapshots are not automatically deleted: review retention
privately. Insufficient free space prevents deployment rather than removing backups.

Run the installer once to adopt this updater. Subsequent successful deployments
syntax-check and atomically replace the installed deployment scripts. Optional
authenticated, read-only production probes can remain in the NAS private-test
directory. A successful public health check alone does not verify member login.

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
