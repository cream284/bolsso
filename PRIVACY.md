# Public repository privacy policy

Only application source code, schema definitions, deployment templates, and
clearly synthetic sample content may be committed to this repository.

Real member and financial data belongs only in the NAS runtime. The repository
must not contain exports, databases, environment files, credentials, private
network identifiers, private-system screenshots, or personal contact details.
Private meeting documents, including bylaws PDFs and bank OCR source images,
must be stored only in protected NAS collections. GitHub may contain their
schema and user interface code, but never the original file or extracted data.

Commit authors must use a GitHub `users.noreply.github.com` address. Before a
change is committed, run:

```bash
./scripts/privacy-check.sh
```

Install the repository-managed pre-commit hook with:

```bash
git config core.hooksPath .githooks
```

Automated checks reduce accidental exposure but do not replace a human privacy
review. If content could refer to a real person, account, payment, or private
system, do not commit it.
