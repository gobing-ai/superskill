#!/usr/bin/env bun
import { createProgram } from './cli';

if (import.meta.main) {
    // parseAsync, not parse: the script/hook `run` actions await a non-blocking stdin
    // read, and Commander only propagates async handler rejections through parseAsync.
    await createProgram().parseAsync();
}
