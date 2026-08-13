# A Complete Guide To AGENTS.md

Have you ever felt concerned about the size of your `AGENTS.md` file?

Maybe you should be. A bad `AGENTS.md` file can confuse your agent, become a maintenance nightmare, and cost you tokens on every request.

So you'd better know how to fix it.

## What is AGENTS.md?

An `AGENTS.md` file is a markdown file you check into Git that customizes how AI coding agents behave in your repository. It sits at the top of the conversation history, right below the system prompt.

Think of it as a configuration layer between the agent's base instructions and your actual codebase. The file can contain two types of guidance:

- **Personal scope**: Your commit style preferences, coding patterns you prefer
- **Project scope**: What the project does, which package manager you use, your architecture decisions

The `AGENTS.md` file is an open standard supported by many - though not all - tools.

<details>
  <summary>CLAUDE.md</summary>

Notably, Claude Code doesn't use `AGENTS.md` - it uses `CLAUDE.md` instead. You can symlink between them to keep all your tools working the same way:

```bash
# Create a symlink from AGENTS.md to CLAUDE.md
ln -s AGENTS.md CLAUDE.md
```

</details>

## Why Massive `AGENTS.md` Files are a Problem

There's a natural feedback loop that causes `AGENTS.md` files to grow dangerously large:

1. The agent does something you don't like
2. You add a rule to prevent it
3. Repeat hundreds of times over months
4. File becomes a "ball of mud"

Different developers add conflicting opinions. Nobody does a full style pass. The result? An unmaintainable mess that actually hurts agent performance.

Another culprit: auto-generated `AGENTS.md` files. Never use initialization scripts to auto-generate your `AGENTS.md`. They flood the file with things that are "useful for most scenarios" but would be better progressively disclosed. Generated files prioritize comprehensiveness over restraint.

### The Instruction Budget

Kyle from Humanlayer's [article](https://www.humanlayer.dev/blog/writing-a-good-claude-md) mentions the concept of an "instruction budget":

> Frontier thinking LLMs can follow ~ 150-200 instructions with reasonable consistency. Smaller models can attend to fewer instructions than larger models, and non-thinking models can attend to fewer instructions than thinking models.

Every token in your `AGENTS.md` file gets loaded on **every single request**, regardless of whether it's relevant. This creates a hard budget problem:

| Scenario                   | Impact                                                |
| -------------------------- | ----------------------------------------------------- |
| Small, focused `AGENTS.md` | More tokens available for task-specific instructions  |
| Large, bloated `AGENTS.md` | Fewer tokens for the actual work; agent gets confused |
| Irrelevant instructions    | Token waste + agent distraction = worse performance   |

Taken together, this means that **the ideal `AGENTS.md` file should be as small as possible.**

### Stale Documentation Poisons Context

Another issue for large `AGENTS.md` files is staleness.

Documentation goes out of date quickly. For human developers, stale docs are annoying, but the human usually has enough built-in memory to be skeptical about bad docs. For AI agents that read documentation on every request, stale information actively _poisons_ the context.

This is especially dangerous when you document file system structure. File paths change constantly. If your `AGENTS.md` says "authentication logic lives in `src/auth/handlers.ts`" and that file gets renamed or moved, the agent will confidently look in the wrong place.

Instead of documenting structure, describe capabilities. Give hints about where things _might_ be and the overall shape of the project. Let the agent generate its own just-in-time documentation during planning.

Domain concepts (like "organization" vs "group" vs "workspace") are more stable than file paths, so they're safer to document. But even these can drift in fast-moving AI-assisted codebases. Keep a light touch.

## Cutting Down Large `AGENTS.md` Files

Be ruthless about what goes here. Consider this the absolute minimum:

- **One-sentence project description** (acts like a role-based prompt)
- **Package manager** (if not npm; or use `corepack` for warnings)
- **Build/typecheck commands** (if non-standard)

That's honestly it. Everything else should go elsewhere.

### The One-Liner Project Description

This single sentence gives the agent context about _why_ they're working in this repository. It anchors every decision they make.

Example:

```markdown
This is a React component library for accessible data visualization.
```

That's the foundation. The agent now understands its scope.

### Package Manager Specification

If you're In a JavaScript project and using anything other than npm, tell the agent explicitly:

```markdown
This project uses pnpm workspaces.
```

Without this, the agent might default to `npm` and generate incorrect commands.

<details>
  <summary>Corepack is also great</summary>
You could also use [`corepack`](https://github.com/nodejs/corepack) to let the system handle warnings automatically, saving you precious instruction budget.
</details>

### Use Progressive Disclosure

Instead of cramming everything into `AGENTS.md`, use **progressive disclosure**: give the agent only what it needs right now, and point it to other resources when needed.

Agents are fast at navigating documentation hierarchies. They understand context well enough to find what they need.

#### Move Language-Specific Rules to Separate Files

If your `AGENTS.md` currently says:

```markdown
Always use const instead of let.
Never use var.
Use interface instead of type when possible.
Use strict null checks.
...
```

Move that to a separate file instead. In your root `AGENTS.md`:

```markdown
For TypeScript conventions, see docs/TYPESCRIPT.md
```

Notice the light touch, no "always," no all-caps forcing. Just a conversational reference.

The benefits:

- TypeScript rules only load when the agent writes TypeScript
- Other tasks (CSS debugging, dependency management) don't waste tokens
- File stays focused and portable across model changes

#### Nest Progressive Disclosure

You can go even deeper. Your `docs/TYPESCRIPT.md` can reference `docs/TESTING.md`. Create a discoverable resource tree:

```
docs/
├── TYPESCRIPT.md
│   └── references TESTING.md
├── TESTING.md
│   └── references specific test runners
└── BUILD.md
    └── references esbuild configuration
```

You can even link to external resources, Prisma docs, Next.js docs, etc. The agent will navigate these hierarchies efficiently.

#### Use Agent Skills

Many tools support "agent skills" - commands or workflows the agent can invoke to learn how to do something specific. These are another form of progressive disclosure: the agent pulls in knowledge only when needed.

We'll cover agent skills in-depth in a separate article.


<SkillsCta
	heading="A great AGENTS.md is step one"
	subtitle="See the skills I run on top of mine to turn that file into shipped work."
	cta="See the skill set"
/>

## `AGENTS.md` in Monorepos

You're not limited to a single `AGENTS.md` at the root. You can place `AGENTS.md` files in subdirectories, and they **merge with the root level**.

This is powerful for monorepos:

### What Goes Where

| Level       | Content                                                      |
| ----------- | ------------------------------------------------------------ |
| **Root**    | Monorepo purpose, how to navigate packages, shared tools (pnpm workspaces) |
| **Package** | Package purpose, specific tech stack, package-specific conventions |

Root `AGENTS.md`:

```markdown
This is a monorepo containing web services and CLI tools.
Use pnpm workspaces to manage dependencies.
See each package's AGENTS.md for specific guidelines.
```

Package-level `AGENTS.md` (in `packages/api/AGENTS.md`):

```markdown
This package is a Node.js GraphQL API using Prisma.
Follow docs/API_CONVENTIONS.md for API design patterns.
```

**Don't overload any level.** The agent sees all merged `AGENTS.md` files in its context. Keep each level focused on what's relevant at that scope.

## Fix A Broken `AGENTS.md` With This Prompt

If you're starting to get nervous about the `AGENTS.md` file in your repo, and you want to refactor it to use progressive disclosure, try copy-pasting this prompt into your coding agent:

```txt
I want you to refactor my AGENTS.md file to follow progressive disclosure principles.

Follow these steps:

1. **Find contradictions**: Identify any instructions that conflict with each other. For each contradiction, ask me which version I want to keep.

2. **Identify the essentials**: Extract only what belongs in the root AGENTS.md:
   - One-sentence project description
   - Package manager (if not npm)
   - Non-standard build/typecheck commands
   - Anything truly relevant to every single task

3. **Group the rest**: Organize remaining instructions into logical categories (e.g., TypeScript conventions, testing patterns, API design, Git workflow). For each group, create a separate markdown file.

4. **Create the file structure**: Output:
   - A minimal root AGENTS.md with markdown links to the separate files
   - Each separate file with its relevant instructions
   - A suggested docs/ folder structure

5. **Flag for deletion**: Identify any instructions that are:
   - Redundant (the agent already knows this)
   - Too vague to be actionable
   - Overly obvious (like "write clean code")
```


<SkillsNewsletterCta
	heading="Get the next AGENTS.md upgrade in your inbox"
	subtitle="Skill posts and changelog notes when Matt sharpens what his agents read."
/>

## Don't Build A Ball Of Mud

When you're about to add something to your `AGENTS.md`, ask yourself where it belongs:

| Location                  | When to use                                        |
| ------------------------- | -------------------------------------------------- |
| Root `AGENTS.md`          | Relevant to every single task in the repo          |
| Separate file             | Relevant to one domain (TypeScript, testing, etc.) |
| Nested documentation tree | Can be organized hierarchically                    |

The ideal `AGENTS.md` is small, focused, and points elsewhere. It gives the agent just enough context to start working, with breadcrumbs to more detailed guidance.

Everything else lives in progressive disclosure: separate files, nested `AGENTS.md` files, or skills.

This keeps your instruction budget efficient, your agent focused, and your setup future-proof as tools and best practices evolve.