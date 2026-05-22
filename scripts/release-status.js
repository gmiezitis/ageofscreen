const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const formatArg = process.argv.find((arg) => arg.startsWith('--format=')) || '--format=text';
const format = formatArg.split('=')[1];
const readinessConfig = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'config', 'release-readiness.json'), 'utf8'),
);
const { collectIssues: collectStoreMetadataIssues } = require('./store-metadata-check');

const exists = (...parts) => fs.existsSync(path.join(repoRoot, ...parts));

const checks = [
    {
        label: 'Vitest suite is configured',
        ok: exists('vitest.config.ts') && exists('tests', 'editorExport.test.ts'),
    },
    {
        label: 'Dev smoke flow is wired',
        ok: exists('scripts', 'run-smoke-electron.js') && exists('scripts', 'smoke-electron.js'),
    },
    {
        label: 'Packaged smoke flow is wired',
        ok: exists('scripts', 'smoke-packaged.js'),
    },
    {
        label: 'Windows CI workflow exists',
        ok: exists('.github', 'workflows', 'windows-packaging.yml'),
    },
    {
        label: 'Bundled FFmpeg payloads exist for x64',
        ok: exists('resources', 'ffmpeg', 'win32-x64', 'ffmpeg.exe')
            && exists('resources', 'ffmpeg', 'win32-x64', 'ffprobe.exe'),
    },
    {
        label: 'Bundled FFmpeg payloads exist for arm64',
        ok: exists('resources', 'ffmpeg', 'win32-arm64', 'ffmpeg.exe')
            && exists('resources', 'ffmpeg', 'win32-arm64', 'ffprobe.exe'),
    },
    {
        label: 'Release plan doc exists',
        ok: exists('docs', 'TEST_AND_RELEASE_PLAN.md'),
    },
];

const blockerGroups = readinessConfig.manualBlockerGroups.map((group) => ({
    heading: group.heading,
    items: group.items.map((item) => ({
        id: item.id,
        label: item.label,
        done: Boolean(item.done),
    })),
}));

const passed = checks.filter((check) => check.ok).length;
const failed = checks.length - passed;
const totalManualItems = blockerGroups.reduce((sum, group) => sum + group.items.length, 0);
const manualBlockersCompleted = blockerGroups.flatMap((group) =>
    group.items
        .filter((item) => item.done)
        .map((item) => ({ heading: group.heading, ...item })),
);
const manualBlockersRemaining = blockerGroups.flatMap((group) =>
    group.items
        .filter((item) => !item.done)
        .map((item) => ({ heading: group.heading, ...item })),
);
const storeMetadataIssues = collectStoreMetadataIssues();
const storeMetadataReady = storeMetadataIssues.length === 0;
const marketReadyToday = manualBlockersRemaining.length === 0 ? 'yes' : 'not yet';

const buildStatus = () => ({
    generatedAt: new Date().toISOString(),
    automatedReadiness: {
        passed,
        failed,
        total: checks.length,
    },
    marketReadyToday,
    manualReadiness: {
        completed: manualBlockersCompleted.length,
        remaining: manualBlockersRemaining.length,
        total: totalManualItems,
    },
    storeMetadata: {
        ready: storeMetadataReady,
        remaining: storeMetadataIssues.length,
        issues: storeMetadataIssues,
    },
    checks,
    blockerGroups,
});

const renderText = () => {
    const lines = [
        'AgeofScreen Release Status',
        '',
        ...checks.map((check) => `${check.ok ? '[pass]' : '[todo]'} ${check.label}`),
        '',
        `Automated readiness: ${passed}/${checks.length} checks passed`,
        `Market-ready today: ${marketReadyToday}`,
        `Manual readiness: ${manualBlockersCompleted.length}/${totalManualItems} items completed`,
        `Store metadata readiness: ${storeMetadataReady ? 'ready' : `${storeMetadataIssues.length} issues remaining`}`,
        '',
        'Remaining blockers:',
        ...blockerGroups.flatMap((group) => [
            `${group.heading}:`,
            ...group.items
                .filter((item) => !item.done)
                .map((item) => `- ${item.label}`),
        ]),
        '',
        'Store metadata issues:',
        ...(
            storeMetadataIssues.length > 0
                ? storeMetadataIssues.map((issue) => `- ${issue.field} ${issue.message}`)
                : ['- None']
        ),
    ];
    return `${lines.join('\n')}\n`;
};

const renderMarkdown = () => {
    const lines = [
        '## Release Status',
        '',
        `**Automated readiness:** ${passed}/${checks.length} checks passed`,
        `**Market-ready today:** ${marketReadyToday}`,
        `**Manual progress:** ${manualBlockersCompleted.length}/${totalManualItems} items completed`,
        `**Manual blockers remaining:** ${manualBlockersRemaining.length}`,
        `**Store metadata:** ${storeMetadataReady ? 'ready' : `${storeMetadataIssues.length} issues remaining`}`,
        '',
        '### Automated Checks',
        ...checks.map((check) => `- ${check.ok ? '[pass]' : '[todo]'} ${check.label}`),
        '',
        '### Manual Progress',
        ...(
            manualBlockersCompleted.length > 0
                ? blockerGroups.flatMap((group) => {
                    const completedItems = group.items.filter((item) => item.done);
                    if (completedItems.length === 0) {
                        return [];
                    }

                    return [
                        `#### ${group.heading} Completed`,
                        ...completedItems.map((item) => `- [done] ${item.label}`),
                        '',
                    ];
                })
                : ['- No manual launch blockers have been marked complete yet.', '']
        ),
        '',
        '### Remaining Manual Blockers',
        ...blockerGroups.flatMap((group) => [
            `#### ${group.heading}`,
            ...group.items
                .filter((item) => !item.done)
                .map((item) => `- ${item.label}`),
            '',
        ]),
        '### Store Metadata',
        ...(
            storeMetadataIssues.length > 0
                ? storeMetadataIssues.map((issue) => `- ${issue.field} ${issue.message}`)
                : ['- [done] Store metadata is ready']
        ),
        '',
    ];
    return `${lines.join('\n')}\n`;
};

const renderJson = () => `${JSON.stringify(buildStatus(), null, 2)}\n`;

if (require.main === module) {
    if (format === 'markdown') {
        process.stdout.write(renderMarkdown());
    } else if (format === 'json') {
        process.stdout.write(renderJson());
    } else {
        process.stdout.write(renderText());
    }
}

module.exports = {
    buildStatus,
    renderJson,
    renderMarkdown,
    renderText,
};
