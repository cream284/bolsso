#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"

failed=0

report_matches() {
  label="$1"
  pattern="$2"
  matches="$(git grep --cached -I -n -E "$pattern" -- . ':(exclude)scripts/privacy-check.sh' ':(exclude)AGENTS.md' ':(exclude)PRIVACY.md' 2>/dev/null || true)"
  if [ -n "$matches" ]; then
    printf 'PRIVACY ERROR: %s\n%s\n' "$label" "$matches" >&2
    failed=1
  fi
}

report_matches "personal email-like value detected" '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
report_matches "private IPv4 address detected" '(^|[^0-9])(10\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}|192\.168\.[0-9]{1,3}\.[0-9]{1,3}|172\.(1[6-9]|2[0-9]|3[01])\.[0-9]{1,3}\.[0-9]{1,3})([^0-9]|$)'
report_matches "private key or credential token detected" 'BEGIN [A-Z ]*PRIVATE KEY|github_pat_[A-Za-z0-9_]+|gh[opsu]_[A-Za-z0-9_]+|AKIA[0-9A-Z]{16}'

blocked_files="$(git ls-files | grep -Ei '(^|/)(pb_data|pb_backups|exports?|backups?|logs?)/|\.(env|sqlite|sqlite3|db|csv|tsv|xlsx?|log|pem|key|p12|pfx)$' || true)"
if [ -n "$blocked_files" ]; then
  printf 'PRIVACY ERROR: sensitive data file type or directory detected\n%s\n' "$blocked_files" >&2
  failed=1
fi

configured_email="$(git config --get user.email || true)"
if [ -n "$configured_email" ]; then
  case "$configured_email" in
    *@users.noreply.github.com) ;;
    *)
      printf 'PRIVACY ERROR: git user.email must use users.noreply.github.com\n' >&2
      failed=1
      ;;
  esac
fi

if [ "$failed" -ne 0 ]; then
  exit 1
fi

printf '%s\n' "Privacy check passed."
