#!/usr/bin/env node
import { run } from '../index.js';

const code = run(process.argv.slice(2), {
  write: (s) => process.stdout.write(s),
  writeErr: (s) => process.stderr.write(s),
});
process.exit(code);
