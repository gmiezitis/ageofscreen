const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const configPath = path.join(repoRoot, 'config', 'store-metadata.json');

const loadConfig = () => JSON.parse(fs.readFileSync(configPath, 'utf8'));

const saveConfig = (config) => {
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
};

const getArgValue = (name) => {
    const arg = process.argv.find((entry) => entry.startsWith(`--${name}=`));
    return arg ? arg.slice(name.length + 3) : '';
};

const listMetadata = (config) => {
    const screenshotLines = config.screenshots.items.map(
        (item) => `- screenshots.items.${item.id}.status = ${item.status}`,
    );

    const lines = [
        'Store metadata',
        '',
        `- partnerCenter.reservedAppName = ${config.partnerCenter.reservedAppName}`,
        `- partnerCenter.identityName = ${config.partnerCenter.identityName}`,
        `- partnerCenter.reservedName = ${config.partnerCenter.reservedName}`,
        `- partnerCenter.publisher = ${config.partnerCenter.publisher}`,
        `- partnerCenter.submissionOwner = ${config.partnerCenter.submissionOwner}`,
        `- publicUrls.privacyPolicy = ${config.publicUrls.privacyPolicy}`,
        `- publicUrls.support = ${config.publicUrls.support}`,
        `- publicUrls.supportEmail = ${config.publicUrls.supportEmail}`,
        `- publicUrls.homepage = ${config.publicUrls.homepage}`,
        `- listing.shortDescriptionOwner = ${config.listing.shortDescriptionOwner}`,
        `- listing.fullDescriptionOwner = ${config.listing.fullDescriptionOwner}`,
        `- listing.knownIssuesOwner = ${config.listing.knownIssuesOwner}`,
        `- listing.finalCopyReviewedDate = ${config.listing.finalCopyReviewedDate}`,
        `- screenshots.owner = ${config.screenshots.owner}`,
        `- screenshots.finalReviewDate = ${config.screenshots.finalReviewDate}`,
        ...screenshotLines,
        '',
        'Set a value with:',
        'node scripts/store-metadata-manage.js set --field=publicUrls.homepage --value=https://example.com',
    ];

    process.stdout.write(`${lines.join('\n')}\n`);
};

const setValueByField = (config, field, value) => {
    if (field.startsWith('screenshots.items.') && field.endsWith('.status')) {
        const itemId = field.slice('screenshots.items.'.length, -'.status'.length);
        const item = config.screenshots.items.find((entry) => entry.id === itemId);
        if (!item) {
            return false;
        }

        item.status = value;
        return true;
    }

    const parts = field.split('.');
    let target = config;
    for (let index = 0; index < parts.length - 1; index += 1) {
        const part = parts[index];
        if (!(part in target) || typeof target[part] !== 'object' || target[part] === null) {
            return false;
        }
        target = target[part];
    }

    const leafKey = parts[parts.length - 1];
    if (!(leafKey in target)) {
        return false;
    }

    target[leafKey] = value;
    return true;
};

const setMetadata = () => {
    const field = getArgValue('field');
    const value = getArgValue('value');

    if (!field) {
        console.error('Missing required flag: --field=<path>');
        process.exit(1);
    }

    if (!value) {
        console.error('Missing required flag: --value=<value>');
        process.exit(1);
    }

    const config = loadConfig();
    const updated = setValueByField(config, field, value);
    if (!updated) {
        console.error(`Unknown store metadata field: ${field}`);
        process.exit(1);
    }

    saveConfig(config);
    process.stdout.write(`Updated ${field}\n`);
};

const command = process.argv[2] || 'list';

if (command === 'list') {
    listMetadata(loadConfig());
} else if (command === 'set') {
    setMetadata();
} else {
    console.error(`Unknown command: ${command}`);
    console.error('Usage: node scripts/store-metadata-manage.js [list|set] [--field=<path>] [--value=<value>]');
    process.exit(1);
}
