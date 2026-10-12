import { resolveMemberConfiguration } from '../src/configuration.mjs';
const file = process.argv[2];
const result = resolveMemberConfiguration(file ? { configFile: file } : {});
console.log(JSON.stringify({ state: result.state, message: result.message, configPath: result.configPath, missing: result.missing }, null, 2));
if (result.state !== 'configured') process.exitCode = 1;
// No key contents, account credentials, database creation, SSH or server calls.
