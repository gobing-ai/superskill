import { type GrokBotDoctorReport, getEnvVar, inspectGrokBotTarget } from '@gobing-ai/superskill-core';
import { echo } from '@gobing-ai/ts-utils';
import type { Command } from 'commander';
import { resolveHomeDir } from './install';

function printSlashRegistry(report: GrokBotDoctorReport): void {
    const where = report.slashRegistry.handoffDir ?? 'unresolved Sand root';
    echo(`grok-bot: slash registry: ${report.slashRegistry.status} (handoffs at ${where})`);
    for (const line of report.slashRegistry.guidance) echo(`  ${line}`);
}

function printHuman(report: GrokBotDoctorReport): void {
    if (report.dataRoot === null) {
        echo(`grok-bot: no Sand data root resolved — ${report.issues[0]?.message ?? 'unresolved'}`);
    } else {
        echo(
            `grok-bot: Sand root ${report.dataRoot} (source: ${report.source}${report.creatable ? ', creatable' : ''})`,
        );
        if (!report.issues.length) {
            echo(`grok-bot: OK — workflows at ${report.workflowsDir}`);
        } else {
            for (const issue of report.issues) {
                echo(`grok-bot: [${issue.code}] ${issue.path}`);
                echo(`  ${issue.message}`);
            }
        }
    }
    printSlashRegistry(report);
}

/**
 * Register `superskill doctor` (task 0128 / ADR-036): read-only grok-bot target
 * inspection. Exit 0 = available (or creatable root), 1 = broken catalog/root,
 * 2 = usage error. Other install targets have no doctor; that limit is intentional.
 */
export function registerDoctor(program: Command): void {
    program
        .command('doctor')
        .description('Read-only health check for the grok-bot install target (other install targets have no doctor)')
        .option(
            '--targets <list>',
            "Required. The only supported value is 'grok-bot' — other install targets have no doctor",
        )
        .option('--json', 'Emit the doctor report as JSON', false)
        .action((options: { targets?: string; json?: boolean }) => {
            const requested = (options.targets ?? '')
                .split(',')
                .map((t) => t.trim())
                .filter((t) => t.length > 0);
            if (requested.length !== 1 || requested[0] !== 'grok-bot') {
                echo(
                    'Error: superskill doctor only inspects the grok-bot target. ' +
                        'Pass --targets grok-bot. Other install targets have no doctor.',
                );
                process.exit(2);
            }
            const report = inspectGrokBotTarget({
                sandData: getEnvVar('SAND_DATA'),
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
