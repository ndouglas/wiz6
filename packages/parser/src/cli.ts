#!/usr/bin/env node
import { describePlan } from './index.js';

const originalDir = process.argv[2] ?? './original';
const plan = describePlan({ originalDir });
console.log(JSON.stringify(plan, null, 2));
