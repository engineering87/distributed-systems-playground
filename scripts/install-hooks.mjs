#!/usr/bin/env node
/* Installs the git hooks of this repository: a commit-msg hook that runs the message
   through scripts/check-commits.mjs, and a pre-push hook that runs the Node tests.
   Run it once after cloning:  node scripts/install-hooks.mjs   (or: npm run hooks) */
import { writeFileSync, chmodSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hooks = join(root, '.git', 'hooks');
if (!existsSync(join(root, '.git'))) {
  process.stderr.write('This is not a git working tree: nothing to install.\n');
  process.exit(1);
}
mkdirSync(hooks, { recursive: true });

const files = {
  'commit-msg': '#!/bin/sh\nexec node "$(dirname "$0")/../../scripts/check-commits.mjs" --file "$1"\n',
  'pre-push': '#!/bin/sh\nnpm test --silent\n'
};
for (const [name, body] of Object.entries(files)) {
  const path = join(hooks, name);
  writeFileSync(path, body);
  chmodSync(path, 0o755);
  process.stdout.write('installed .git/hooks/' + name + '\n');
}
process.stdout.write('\nThe browser suites are not in the hooks: they take a couple of minutes.\nRun them before a release with: npm run test:browser\n');
