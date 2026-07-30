import {
    createEngineRegistry,
    verifyEngineRegistry
} from '../modules/engine-controller.mjs';

const network = process.argv.includes('--network');
const report = await verifyEngineRegistry(createEngineRegistry(), { network });
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.deterministicValid) process.exitCode = 1;
