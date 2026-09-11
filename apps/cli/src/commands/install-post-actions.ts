/**
 * Target-keyed post-install action registration for `install`/`update`
 * (task 0130, ADR-037). Target-specific validated data is captured by typed
 * action factories/closures here — nothing Bot-specific leaks into the common
 * runner context or the install dispatcher.
 */

import type {
    BotRegisterHandoff,
    BotSkillEntry,
    GrokBotMaterialize,
    GrokBotSource,
    PostInstallAction,
    PostInstallContext,
    PostInstallResult,
    TransactionalWrite,
} from '@gobing-ai/superskill-core';
import {
    BOT_SLASH_CAVEAT,
    botBootstrapMessages,
    botRegisterHandoffPath,
    buildBotRegisterHandoff,
    serializeBotRegisterHandoff,
} from '@gobing-ai/superskill-core';

/** Validated per-invocation data for the grok-bot registration-handoff action. */
export interface GrokBotRegisterActionArgs {
    plugin: string;
    entries: readonly BotSkillEntry[];
    source: GrokBotSource;
    materialize: GrokBotMaterialize;
    dataRoot: string;
    /** Transaction-scoped writer bound to the emission's rollback boundary. */
    writeTransactional: TransactionalWrite;
}

/** Stable action id for the grok-bot registration handoff. */
export const BOT_REGISTER_ACTION_ID = 'grok-bot/register-handoff';

/**
 * Build the grok-bot registration handoff action (R1/R3/R9): writes one
 * deterministic `<plugin>.json` under the Sand register directory inside the
 * emission transaction, and reports prepared-next-steps (never claimed
 * registration success) afterwards.
 */
export function createGrokBotRegisterAction(args: GrokBotRegisterActionArgs): PostInstallAction {
    const path = () => botRegisterHandoffPath(args.dataRoot, args.plugin);
    const summarize = (handoff: BotRegisterHandoff): string =>
        `${handoff.skills.length} skill record(s), ${handoff.materialize} materialization`;
    return {
        id: BOT_REGISTER_ACTION_ID,
        preview: (_context: PostInstallContext): PostInstallResult => {
            // Building validates content; the caller's guard writer enforces no writes.
            const handoff = buildBotRegisterHandoff(args);
            const bootstrap = botBootstrapMessages({
                dataRoot: args.dataRoot,
                plugin: args.plugin,
                entries: args.entries,
            });
            return {
                writtenFiles: [],
                messages: [
                    `handoff would be prepared at ${path()} (${summarize(handoff)})`,
                    BOT_SLASH_CAVEAT,
                    ...bootstrap.map((line) => `prospective bootstrap (after install): ${line}`),
                ],
            };
        },
        apply: async (_context: PostInstallContext): Promise<PostInstallResult> => {
            const handoff = buildBotRegisterHandoff(args);
            const handoffPath = path();
            await args.writeTransactional(handoffPath, serializeBotRegisterHandoff(handoff));
            const bootstrap = botBootstrapMessages({
                dataRoot: args.dataRoot,
                plugin: args.plugin,
                entries: args.entries,
            });
            return {
                writtenFiles: [handoffPath],
                messages: [
                    `handoff prepared at ${handoffPath} (${summarize(handoff)})`,
                    BOT_SLASH_CAVEAT,
                    ...bootstrap.map((line) => `bootstrap: ${line}`),
                ],
            };
        },
    };
}
