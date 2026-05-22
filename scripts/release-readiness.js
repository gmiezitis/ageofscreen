const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const configPath = path.join(repoRoot, 'config', 'release-readiness.json');

const loadConfig = () => JSON.parse(fs.readFileSync(configPath, 'utf8'));

const saveConfig = (config) => {
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
};

const flattenItems = (config) => config.manualBlockerGroups.flatMap((group) =>
    group.items.map((item) => ({ group, item })),
);

const findItemById = (config, id) => flattenItems(config).find(({ item }) => item.id === id);

const renderList = (config) => {
    const lines = [
        'Release readiness items',
        '',
        ...config.manualBlockerGroups.flatMap((group) => [
            `${group.heading}:`,
            ...group.items.map((item) => `- [${item.done ? 'done' : 'todo'}] ${item.id}: ${item.label}`),
            '',
        ]),
    ];

    process.stdout.write(`${lines.join('\n')}\n`);
};

const updateItemState = (nextDone) => {
    const idArg = process.argv.find((arg) => arg.startsWith('--id='));
    const id = idArg ? idArg.split('=')[1] : '';

    if (!id) {
        console.error('Missing required flag: --id=<blocker-id>');
        process.exit(1);
    }

    const config = loadConfig();
    const match = findItemById(config, id);

    if (!match) {
        console.error(`Unknown release readiness item: ${id}`);
        process.exit(1);
    }

    match.item.done = nextDone;
    saveConfig(config);
    process.stdout.write(
        `${nextDone ? 'Marked complete' : 'Marked incomplete'}: ${match.item.id} (${match.group.heading})\n`,
    );
};

const command = process.argv[2] || 'list';

if (command === 'list') {
    renderList(loadConfig());
} else if (command === 'done') {
    updateItemState(true);
} else if (command === 'todo') {
    updateItemState(false);
} else {
    console.error(`Unknown command: ${command}`);
    console.error('Usage: node scripts/release-readiness.js [list|done|todo] [--id=<blocker-id>]');
    process.exit(1);
}
