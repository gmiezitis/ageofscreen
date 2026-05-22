const { buildStatus } = require('./release-status');

const modeArg = process.argv.find((arg) => arg.startsWith('--mode=')) || '--mode=automated';
const mode = modeArg.split('=')[1];
const status = buildStatus();

const automatedFailures = status.checks.filter((check) => !check.ok);
const automatedReady = automatedFailures.length === 0;
const marketReady = status.marketReadyToday === 'yes';
const remainingManualBlockers = status.blockerGroups.flatMap((group) =>
    group.items
        .filter((item) => !item.done)
        .map((item) => `${group.heading}: ${item.label}`),
);

const automatedMessage = automatedReady
    ? `Automated release gate passed (${status.automatedReadiness.passed}/${status.automatedReadiness.total} checks green).`
    : `Automated release gate failed: ${automatedFailures.map((check) => check.label).join('; ')}`;

const marketMessage = marketReady
    ? 'Market release gate passed.'
    : `Market release gate is still blocked by manual readiness items: ${remainingManualBlockers.join('; ')}`;

if (mode === 'market') {
    if (!marketReady) {
        console.error(marketMessage);
        process.exit(1);
    }

    console.log(marketMessage);
    process.exit(0);
}

if (!automatedReady) {
    console.error(automatedMessage);
    process.exit(1);
}

console.log(automatedMessage);
