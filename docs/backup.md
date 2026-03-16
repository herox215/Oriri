# Oriri Backup Guide

All Oriri state lives in `.oriri/` as plain Markdown files. There is no database — making a backup is as simple as copying that directory.

---

## Automated Backups with Cron

Use `oriri backup` together with a cron job for fully automatic hourly backups.

**Add to crontab (`crontab -e`):**

```cron
# Hourly Oriri backup
0 * * * * cd /path/to/your/project && npx oriri backup
```

Each run creates a timestamped snapshot under `oriri-backups/`:

```
oriri-backups/
  oriri-backup-2026-03-16T10-00-00/
  oriri-backup-2026-03-16T11-00-00/
  ...
```

To save backups to a custom location, pass `--target`:

```cron
0 * * * * cd /path/to/your/project && npx oriri backup --target /mnt/backup/oriri
```

---

## `oriri backup` Command Reference

```
oriri backup [--target <dir>]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--target <dir>` | `./oriri-backups/` | Directory where backup snapshots are written |

Each invocation creates a new subdirectory named `oriri-backup-<ISO-timestamp>` inside the target directory.

---

## Server Mode: Auto-Commit Snapshots

In server mode, Oriri can automatically commit `.oriri/` as a git snapshot after each backup. Enable it in `config.yaml`:

```yaml
mode: server
backup:
  auto_snapshot: true
```

With `auto_snapshot: true`, `oriri backup` will run:

```bash
git add .oriri
git commit -m "[auto] Oriri snapshot <timestamp>"
```

in the project root after the file copy. The commit is best-effort — if git is unavailable the backup still succeeds.

---

## Recovery

If files are lost or corrupted, Oriri's built-in file recovery (T-025) can reconstruct task files from agent memory, log files, and `story.md`. For complete recovery, restore from a backup:

```bash
cp -r oriri-backups/oriri-backup-<timestamp>/ .oriri/
```
