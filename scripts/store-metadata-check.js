const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const metadataPath = path.join(repoRoot, 'config', 'store-metadata.json');

const placeholderValues = new Set(['TBD', '', 'CHANGE_ME']);

const isPlaceholder = (value) => {
    if (typeof value !== 'string') {
        return false;
    }

    const trimmed = value.trim();
    return placeholderValues.has(trimmed);
};

const collectIssues = () => {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    const issues = [];

    const addIssue = (field, message) => {
        issues.push({ field, message });
    };

    const requireValue = (field, value) => {
    if (isPlaceholder(value)) {
        addIssue(field, 'is still unset');
    }
    };

    const requireUrl = (field, value) => {
    requireValue(field, value);
    if (!isPlaceholder(value) && !/^https?:\/\//i.test(value)) {
        addIssue(field, 'must be an http(s) URL');
    }
    };

    const requireEmail = (field, value) => {
    requireValue(field, value);
    if (!isPlaceholder(value) && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
        addIssue(field, 'must be a valid email address');
    }
    };

    requireValue('partnerCenter.reservedAppName', metadata.partnerCenter.reservedAppName);
    requireValue('partnerCenter.identityName', metadata.partnerCenter.identityName);
    requireValue('partnerCenter.reservedName', metadata.partnerCenter.reservedName);
    requireValue('partnerCenter.publisher', metadata.partnerCenter.publisher);
    requireValue('partnerCenter.submissionOwner', metadata.partnerCenter.submissionOwner);

    requireUrl('publicUrls.privacyPolicy', metadata.publicUrls.privacyPolicy);
    requireUrl('publicUrls.support', metadata.publicUrls.support);
    requireEmail('publicUrls.supportEmail', metadata.publicUrls.supportEmail);
    requireUrl('publicUrls.homepage', metadata.publicUrls.homepage);

    requireValue('listing.shortDescriptionOwner', metadata.listing.shortDescriptionOwner);
    requireValue('listing.fullDescriptionOwner', metadata.listing.fullDescriptionOwner);
    requireValue('listing.knownIssuesOwner', metadata.listing.knownIssuesOwner);
    requireValue('listing.finalCopyReviewedDate', metadata.listing.finalCopyReviewedDate);

    requireValue('screenshots.owner', metadata.screenshots.owner);
    requireValue('screenshots.finalReviewDate', metadata.screenshots.finalReviewDate);
    metadata.screenshots.items.forEach((item) => {
        if (isPlaceholder(item.status)) {
            addIssue(`screenshots.items.${item.id}`, 'capture status is still unset');
        }
    });

    return issues;
};

if (require.main === module) {
    const issues = collectIssues();
    if (issues.length > 0) {
        process.stderr.write('Store metadata is not ready yet:\n');
        issues.forEach((issue) => {
            process.stderr.write(`- ${issue.field} ${issue.message}\n`);
        });
        process.exit(1);
    }

    process.stdout.write('Store metadata check passed.\n');
}

module.exports = {
    collectIssues,
};
