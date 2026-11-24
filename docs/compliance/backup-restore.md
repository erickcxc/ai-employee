# Backup and restore runbook

How the database is backed up, how to restore it and how to prove the restore worked. SOC 2 A1.2,
A1.3 and CC9.1. The policy that sets the targets is
`docs/compliance/policies/backup-and-recovery.md`.

## What is proven in code

A backup is only a backup once it has been restored. `src/compliance/backup.test.ts` runs on every
change: it seeds a database, takes a full backup, restores it into a new database and checks the
result with `src/compliance/backup.ts`:

- `src/compliance/backup.test.ts` "a restored database has every row the original had"
- `src/compliance/backup.test.ts` "the restore check passes: audit chain intact, row-level security still forced, no migration missing"
- `src/compliance/backup.test.ts` "encrypted contact details survive the restore and still need the key"
- `src/compliance/backup.test.ts` "the restore check catches a restore that lost rows"

The same check runs against a real restore with `scripts/verify-restore.ts`.

## Backups in production

Two layers, so losing one still leaves the other:

1. **Host snapshots with point-in-time recovery.** Turn them on at the database host and keep at least 7 days. This covers "someone deleted the wrong thing an hour ago".
2. **A nightly logical dump to separate storage.** Covers losing the host account itself.
   ```sh
   pg_dump "$DATABASE_URL" --format=custom --file="backup-$(date -u +%Y%m%d).dump"
   ```
   Store it encrypted, in a different account from the database host, and keep 30 days.

**The field key is part of the backup plan.** Contact details are encrypted with `FIELD_KEY`. A
restored database without the key that encrypted it has unreadable phone numbers and addresses. Keep
the key in the secret store, with a second copy in a separate place only the owner can reach. Never
store it next to the dumps.

## Restore drill (once a quarter, and after any change to the schema)

1. Before taking the backup you will restore, record the row counts:
   ```sh
   DATABASE_URL=<production> bun scripts/verify-restore.ts counts > counts.json
   ```
2. Restore into a new, empty database (never over production):
   ```sh
   createdb restore_drill
   pg_restore --no-owner --dbname=restore_drill backup-YYYYMMDD.dump
   ```
   The app roles (`app_owner`, `app_team`, `app_agent`, `app_auth`, `app_system`, `app_runtime`) belong to the server, not the database. On a new server, create them first by running `bun scripts/migrate.ts` once against a separate throwaway database there. The dump restores tables and data before triggers, so loading it adds nothing to the audit log.
3. Check it:
   ```sh
   DATABASE_URL=<restore_drill> bun scripts/verify-restore.ts check counts.json
   ```
   It prints `restore verified`, or every problem it found: missing rows, a broken audit chain, a table without forced row-level security, a migration not applied. Counts taken some time before the dump can differ by the writes in between; note those in the record.
4. With `FIELD_KEY` set to the production key, step 3 also decrypts one customer's phone number. `field key: ok` means the key and the data belong together.
5. Record the drill: date, backup used, time taken, the output of step 3, who ran it. That record is the evidence an auditor asks for.
6. Drop the copy: `dropdb restore_drill`.

## Real recovery

1. Declare an incident (`docs/compliance/policies/incident-response.md`).
2. Stop writes: pause the daily job and take the app offline or read-only.
3. Restore from the host's point-in-time recovery to just before the damage. If the host account is lost, restore the latest nightly dump to a new host.
4. Run step 3 of the drill against the restored database.
5. Point `DATABASE_URL` at it, bring the app back and confirm a test call and a sign-in work.
6. Write down what was lost between the restore point and the incident, and tell the owner.
