# Repository privacy rules

This repository is public-source code only. Never commit personal, financial,
authentication, or private infrastructure data.

## Prohibited content

- Real member names, personal email addresses, phone numbers, home addresses,
  birth dates, account identifiers, or profile exports
- Dues records, bank statements, transaction exports, balances tied to people,
  or uploaded spreadsheets containing real data
- Private meeting documents such as bylaws PDFs, bank screenshots, OCR inputs,
  or extracted OCR results
- Passwords, API tokens, cookies, session values, encryption keys, SSH keys, or
  environment files
- NAS LAN addresses, private hostnames, QuickConnect identifiers, DSM account
  names, logs, database files, backups, or screenshots of private systems
- Git commit author addresses other than a GitHub `users.noreply.github.com`
  address

## Required practice

- Use clearly synthetic labels such as `샘플 회원`, `샘플 모임`, and
  `예시 장소` in code, fixtures, screenshots, and documentation.
- Keep runtime data, secrets, private documents, and uploaded files only on the
  NAS in ignored paths.
- Run `scripts/privacy-check.sh` before every commit and before publication.
- Stop and request review whenever a value could identify a real person or
  private system.
