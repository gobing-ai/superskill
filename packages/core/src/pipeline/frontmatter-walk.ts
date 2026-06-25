/**
 * Shared frontmatter-block walker for the adapt-* stages.
 *
 * The command and subagent adapters both inject a canonical `name:` and walk the
 * YAML frontmatter block line by line; only their per-line rewrites and
 * closing-delimiter injections differ. This walker owns the opener/closer/
 * name-skip machinery so each adapter supplies only its differences.
 */

/** A per-line rewrite applied inside the frontmatter block (excluding the `name:` line, which the walker owns). */
export interface FrontmatterLineRule {
    /** Match a frontmatter line. */
    test: (line: string) => boolean;
    /**
     * Rewrite the matched line. Return the replacement line(s), or `null` to drop
     * the line entirely. The walker pushes the result verbatim.
     */
    rewrite: (line: string) => string | null;
}

/** Options controlling the frontmatter walk. */
export interface FrontmatterWalkOptions {
    /** The canonical name to inject as the first frontmatter field. */
    expectedName: string;
    /** Per-line rewrite rules applied in order; first match wins. */
    lineRules?: FrontmatterLineRule[];
    /**
     * Lines to inject just before the closing `---`, only when `shouldInjectAtCloser`
     * returns true for the lines already seen in the block. Used for
     * `disable-model-invocation: true` on commands.
     */
    closerInjection?: {
        lines: string[];
        /** Decide whether to inject, given the frontmatter lines seen so far. */
        shouldInject: (seenLines: string[]) => boolean;
    };
    /**
     * Fallback frontmatter block (without the trailing body) used when the content
     * never produced an opening `---`. The walker appends `\n\n${content}`.
     */
    fallbackBlock: string;
}

/**
 * Walk a markdown string's YAML frontmatter, injecting `name:` after the opener,
 * skipping any pre-existing `name:`, applying per-line rules, and optionally
 * injecting lines before the closer. Body content is preserved unchanged.
 */
export function walkFrontmatter(content: string, opts: FrontmatterWalkOptions): string {
    const lines = content.split('\n');
    const out: string[] = [];
    const seenInBlock: string[] = [];
    let inFrontmatter = false;
    let pastOpener = false;
    let injectedName = false;

    for (const line of lines) {
        if (!pastOpener) {
            if (line.trim() === '---') {
                inFrontmatter = true;
                pastOpener = true;
                out.push(line);
                out.push(`name: ${opts.expectedName}`);
                injectedName = true;
                continue;
            }
            out.push(line);
            continue;
        }

        if (inFrontmatter) {
            if (line.trim() === '---') {
                if (opts.closerInjection?.shouldInject(seenInBlock)) {
                    out.push(...opts.closerInjection.lines);
                }
                inFrontmatter = false;
                out.push(line);
                continue;
            }
            // The walker owns the name field — drop any existing one.
            if (/^name:\s*/.test(line)) continue;

            seenInBlock.push(line);

            const rule = opts.lineRules?.find((r) => r.test(line));
            if (rule) {
                const rewritten = rule.rewrite(line);
                if (rewritten !== null) out.push(rewritten);
                continue;
            }
            out.push(line);
            continue;
        }
        out.push(line);
    }

    // If we never found a closing `---`, the entire body was absorbed as frontmatter.
    // Fall back to the fallback block to avoid corrupting the content.
    if (!injectedName || inFrontmatter) {
        return `${opts.fallbackBlock}\n\n${content}`;
    }
    return out.join('\n');
}
