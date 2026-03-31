const fs = require("fs");
const path = require("path");

const targets = [
    path.resolve(process.cwd(), "out"),
    path.resolve(process.cwd(), ".webpack"),
];

for (const target of targets) {
    if (fs.existsSync(target)) {
        fs.rmSync(target, { recursive: true, force: true });
        console.log(`[clean-generated] removed ${path.basename(target)}`);
    }
}
