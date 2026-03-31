const { spawn } = require('child_process');
const start = '0.000';
const end = '1.000';
const breathAmt = '0.0200';
const effectW = 128;
const effectH = 128;

const zoomExpr = `(1+${breathAmt}*abs(sin(PI*(t-${start}))))`;
const cropW = `'if(between(t,${start},${end}),iw/${zoomExpr},iw)'`;
const cropH = `'if(between(t,${start},${end}),ih/${zoomExpr},ih)'`;

const filter = `[0:v]crop=${cropW}:${cropH}:'(iw-ow)/2':'(ih-oh)/2',scale=${effectW}:${effectH}:flags=lanczos[out]`;

console.log('Filter:', filter);

const p = spawn('ffmpeg', [
    '-f', 'lavfi', '-i', 'color=c=red:s=128x128:d=2',
    '-filter_complex', filter,
    '-map', '[out]', '-an', '-t', '2', '-y', 'test-node-breath.mp4'
]);

let err = '';
p.stderr.on('data', d => err += d.toString());
p.on('close', c => {
    console.log('Exit code:', c);
    if (c !== 0) console.log('ERROR:', err.slice(-500));
    else console.log('SUCCESS');
});
