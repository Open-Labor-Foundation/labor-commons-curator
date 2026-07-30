#!/usr/bin/env node
'use strict';

// Fails when vendor/commons-crew is pinned too far behind commons-crew's
// main branch. This repo certifies catalog records against the contract
// vendored from commons-crew -- if the pin silently drifts, certification
// runs against a stale contract with no signal. Round-3 remediation found
// an 8-commit / ~2-week silent drift with no check catching it; the
// threshold below is set below that scale so future drift trips this well
// before it reaches the size that went unnoticed.

const { execFileSync } = require('child_process');

const OWNER = 'Open-Labor-Foundation';
const REPO = 'commons-crew';
const SUBMODULE_PATH = 'vendor/commons-crew';
const MAX_ALLOWED_DRIFT = 5;

function getPinnedCommit() {
  const status = execFileSync('git', ['submodule', 'status', SUBMODULE_PATH], {
    encoding: 'utf8',
  });
  // Leading status char is ' ' (in sync), '+' (checked-out commit differs
  // from the superproject's index), or '-' (uninitialized) -- don't depend
  // on it (a leading space is easy to lose to an outer .trim()); just pull
  // the 40-char SHA out of the line.
  const match = status.match(/([0-9a-f]{40})/);
  if (!match) {
    throw new Error(`Could not parse pinned commit from "git submodule status" output: ${status}`);
  }
  return match[1];
}

async function main() {
  const pinned = getPinnedCommit();

  const headers = { 'user-agent': 'labor-commons-curator-drift-check' };
  if (process.env.GITHUB_TOKEN) {
    headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const url = `https://api.github.com/repos/${OWNER}/${REPO}/compare/${pinned}...main`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Failed to compare ${pinned}...main: HTTP ${res.status} (${url})`);
  }
  const body = await res.json();
  const aheadBy = body.ahead_by;

  if (typeof aheadBy !== 'number') {
    throw new Error(`Unexpected response shape from ${url}: missing ahead_by`);
  }

  if (aheadBy > MAX_ALLOWED_DRIFT) {
    console.error(
      `vendor/commons-crew is pinned ${aheadBy} commits behind ${REPO} main ` +
        `(pinned ${pinned.slice(0, 7)}, main ${body.commits?.at(-1)?.sha?.slice(0, 7) ?? 'unknown'}), ` +
        `which exceeds the allowed drift of ${MAX_ALLOWED_DRIFT}. Bump the submodule pin ` +
        `(cd ${SUBMODULE_PATH} && git checkout main && git pull) and re-run the 76-test suite ` +
        `before merging.`
    );
    process.exit(1);
  }

  console.log(
    `vendor/commons-crew is ${aheadBy} commit(s) behind ${REPO} main (allowed drift: ${MAX_ALLOWED_DRIFT}).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
