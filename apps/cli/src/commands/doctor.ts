import { type GrokBotDoctorReport, inspectGrokBotTarget } from '@gobing-ai/superskill-core';
import { echo } from '@gobing-ai/ts-utils';
import type { Command } from 'commander';
import { resolveHomeDir } from './install';

function printHuman(report: GrokBotDoctorReport): void {
    if (report.dataRoot === null) {
        echo(`grok-bot: no Sand data root resolved — ${report.issues[0]?.message ?? 'unresolved'}`);
        return;
    }
    echo(`grok-bot: Sand root ${report.dataRoot} (source: ${report.source}${report.creatable ? ', creatable' : ''})`);
    if (!report.issues.length) {
        echo(`grok-bot: OK — workflows at ${report.workflowsDir}`);
        return;
    }
    for (const issue of report.issues) {
        echo(`grok-bot: [${issue.code}] ${issue.path}`);
        echo(`  ${issue.message}`);
    }
}

/**
 * Register `superskill doctor` (task 0128 / ADR-036): read-only grok-bot target
 * inspection. Exit 0 = available (or creatable root), 1 = broken catalog/root,
 * 2 = usage error. Other targets have no doctor.
 */
export function registerDoctor(program: Command): void {
    program
        .command('doctor')
        .description('Inspect the grok-bot Sand data root and workflow catalog (read-only)')
        .option('--targets <list>', "Target to inspect — only 'grok-bot' is supported")
        .option('--json', 'Emit the doctor report as JSON', false)
        .action((options: { targets?: string; json?: boolean }) => {
            const requested = (options.targets ?? '')
                .split(',')
                .map((t) => t.trim())
                .filter((t) => t.length > 0);
            if (requested.length !== 1 || requested[0] !== 'grok-bot') {
                echo('Error: superskill doctor supports only --targets grok-bot');
                process.exit(2);
            }
            const report = inspectGrokBotTarget({
                sandData: process.env.SAND_DATA,
                homeDir: resolveHomeDir(),
            });
            if (options.json === true) {
                echo(JSON.stringify(report, null, 2));
            } else {
                printHuman(report);
            }
            process.exit(report.available ? 0 : 1);
        });
}
