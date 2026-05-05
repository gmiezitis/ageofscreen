export const run = (name: string, fn: () => void) => {
    const maybeTest = (globalThis as typeof globalThis & {
        test?: (name: string, fn: () => void) => void;
    }).test;
    if (typeof maybeTest === 'function') {
        maybeTest(name, fn);
        return;
    }
    fn();
    console.log(`PASS ${name}`);
};
