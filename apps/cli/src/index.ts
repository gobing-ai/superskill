#!/usr/bin/env bun
import { createProgram } from './cli';

if (import.meta.main) {
    createProgram().parse();
}
