# Security

Second Brain stores people's private notes, so security reports get priority.

## Reporting a vulnerability

Please do not open a public issue. Report it privately through
[GitHub's private vulnerability reporting](https://github.com/bhushan/getsecondbrain.io/security/advisories/new)
or by email to hello@getsecondbrain.io.

Include what you found, the steps to reproduce it, and the impact you expect. You will get a reply
within a few days. Please give us a reasonable time to fix the issue before disclosing it.

## Scope

In scope: this repository and the hosted service at `getsecondbrain.io`, `app.getsecondbrain.io`
and `mcp.getsecondbrain.io`, especially anything that lets one account or workspace read or change
another's notes, bypasses the OAuth consent or scopes, or makes the service fetch URLs it should not.

Out of scope: denial of service by volume, social engineering, and reports from automated scanners
without a working proof.

Only test against accounts and workspaces you own.
