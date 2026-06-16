# README.md

## Project Objective
In previous project in `cc-agents`, we already figure out a solution to synchronize claude code plugin format agent skills, slash commands, subagents, hooks and the other relevant things. For the details, you can refer to `/Users/robin/projects/cc-agents/scripts` (config file in `/Users/robin/projects/cc-agents/rulesync.jsonc`).

But we also encountered some issues when we use the agent skills, slash commands, subagents, hooks and the other relevant things via different coding agents. We need to have a comprehensive code review and decide how to enhance it or convert it as a new indepedent tool in current project.

Currently, the major issues I encountered are (not limited to):
- It's designed for plugin `rd3` and `wt` only
- It did use an external tool which named as `rulesync`, but it looks like that we did not use it very well -- we also got involved with a set of bash scripts to make sure the tool works as we expected. So my question is simple:
  - Can we only use this `rulesync` to get all (at least most) of these features works well as expected? If yes, then we need to figure out how can we leverage it to make sure we can dispach these claude code plugin format things to all these coding agent with approriate format.
  - Contraryly, can we easily get rid of `rulesync` then customize a new typescript script to ensure all these features can work perfectly with other coding agents,
  - Or, we still need to work with `rulesync` but with deeper customization.
- Enhance the coding agent list:
  - Add support for these new one: Hermes, omp (one `pi` viariant with some customization)
  - get Deprecated on `Gemini CLI` and the old version of `Google Antigravity`, and add new support for antigravity-ide and the antigravity-cli (agy) as Google announced that Antigravity 2.0 splits into two products with separate global config trees: the desktop antigravity-ide and the antigravity-cli (agy).

To help to understand `rulesync`, I also download its source code into `vendors/rulesync`, if needed, you can refer to it. Now I need your help to have a comprehensive code review on `/Users/robin/projects/cc-agents/scripts` to see how deep we get involved with `rulesync` and what's your suggestion and solutions if we go with or without `rulesync`


====================================
After these investigation, it looks like that here comes the best solution:

 - Based on the template project in `~/xprojects/ts-base` to customize a new `cli` mode project into current folder as the project base. It will be a typescript + bun + biome project with a single CLI command and will be publish to npm registery later.
 - Leverage `rulesync` package and all `@gobing-ai/ts-ai-*` in `~/xprojects/ts-libs` if needed to compose the key functionalities.
 - As we did in `/Users/robin/projects/cc-agents/scripts`, we also need to keep the convertion rules during the different coding agents. For example, `rd3:dev-run` in claude code should be converted into:
  - `$rd3-dev-run` in codex
  - `/skill:rd3-dev-run` in pi and omp
  - `/rd3-dev-run` for the others.
  - Not limited to this, we need to carefuly check with `/Users/robin/projects/cc-agents/scripts` to see what we'd done today.

- At the begining, we can keep claude code plugin format as the SSOT. After we finish it, then we can access the others after all currently `rulesync` already can import other kind of agent skills. The issue for us is how to design the enhancement mapping mechanism, so that we can also work with other type of source code once we start to import with.

How about this solition, I need your assesment on both pros and cons before we kick off the implementation and suggestions if any.
