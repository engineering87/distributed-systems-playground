#!/usr/bin/env node
/* Checks commit messages against the convention this repository already follows.
   No dependencies: it reads messages from a range, a file or standard input.

     node scripts/check-commits.mjs --file .git/COMMIT_EDITMSG      # one message, from the hook
     node scripts/check-commits.mjs --range origin/main..HEAD       # every commit of a branch
     echo "feat: add a thing" | node scripts/check-commits.mjs      # from a pipe

   The shape is the conventional one, and the reasons for each rule are the same reasons the
   changelog reads well: the type says what kind of change it is, the subject says what changed. */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

export const TYPES = ['feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'build', 'ci', 'chore', 'style', 'revert'];
const HEADER_MAX = 72;
const BODY_MAX = 100;

export function checkMessage(message) {
  const problems = [];
  const lines = String(message).replace(/\r/g, '').split('\n');
  // a merge or a revert made by a tool is not ours to shape
  if (/^(Merge|Revert) /.test(lines[0])) return problems;
  const header = lines[0].trim();

  if (!header) return ['the message is empty'];
  if (header.length > HEADER_MAX) problems.push(`the first line is ${header.length} characters, ${HEADER_MAX} is the limit`);

  const m = /^([a-z]+)(\(([a-z0-9,\- ]+)\))?(!)?: (.+)$/.exec(header);
  if (!m) {
    problems.push('the first line should read "type: what changed", for example "fix(engine): drop late messages"');
    return problems;
  }
  const [, type, , , , subject] = m;
  if (!TYPES.includes(type)) problems.push(`"${type}" is not one of: ${TYPES.join(', ')}`);
  if (/[.!?]$/.test(subject)) problems.push('the subject should not end with punctuation');
  if (/^[A-Z][a-z]/.test(subject)) problems.push('the subject should start in lower case');
  if (subject.length < 8) problems.push('the subject is too short to say anything');

  if (lines.length > 1 && lines[1].trim() !== '') problems.push('leave a blank line between the subject and the body');
  lines.slice(2).forEach((l, i) => {
    // long URLs and code are not worth wrapping
    if (l.length > BODY_MAX && !/https?:\/\/|^\s{2,}|`/.test(l)) {
      problems.push(`body line ${i + 3} is ${l.length} characters, ${BODY_MAX} is the limit`);
    }
  });
  return problems;
}

function messagesFromRange(range) {
  // -z separates the entries of the output with a NUL; a NUL cannot be passed inside an argument,
  // which is why the separator does not belong in --format.
  const out = execFileSync('git', ['log', '--reverse', '-z', '--format=%B', range], { encoding: 'utf8' });
  return out.split('\u0000').map(s => s.trim()).filter(Boolean);
}

function main(argv) {
  let messages = [];
  const fileAt = argv.indexOf('--file');
  const rangeAt = argv.indexOf('--range');
  try {
    if (fileAt >= 0) messages = [readFileSync(argv[fileAt + 1], 'utf8')];
    else if (rangeAt >= 0) messages = messagesFromRange(argv[rangeAt + 1]);
    else messages = [readFileSync(0, 'utf8')];
  } catch (e) {
    process.stderr.write('Cannot read the commit messages: ' + e.message + '\n');
    return 2;
  }
  // comment lines belong to the editor, not to the message
  messages = messages.map(m => m.split('\n').filter(l => !l.startsWith('#')).join('\n').trim()).filter(Boolean);
  let bad = 0;
  for (const message of messages) {
    const problems = checkMessage(message);
    if (!problems.length) continue;
    bad++;
    process.stderr.write('\n' + message.split('\n')[0] + '\n');
    for (const p of problems) process.stderr.write('  - ' + p + '\n');
  }
  if (bad) {
    process.stderr.write(`\n${bad} of ${messages.length} message(s) need a rewrite. The shape is:\n\n`);
    process.stderr.write('  type(scope): what changed, in lower case, no full stop\n\n');
    process.stderr.write('  types: ' + TYPES.join(', ') + '\n');
    return 1;
  }
  process.stdout.write(`${messages.length} commit message(s) look right.\n`);
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith('check-commits.mjs')) process.exit(main(process.argv.slice(2)));
