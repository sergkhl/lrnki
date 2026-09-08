import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const revision = "1234567890123456789012345678901234567890";

// Exercise the deploy's control flow with a recording Docker CLI; never contact a daemon.
const docker = `#!/usr/bin/env node
import { appendFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(process.env.DEPLOY_TEST_TRACE, JSON.stringify(args) + '\\n');
const command = args.join(' ');
const scenario = process.env.DEPLOY_TEST_SCENARIO;
const revision = '${revision}';
if (command === 'compose config --format json') {
  console.log(JSON.stringify({services:{'learner-api':{
    environment:{BETTER_AUTH_SECRET:'test-only',BETTER_AUTH_URL:'https://api.lrnki.globesoul.com'},
    ports: scenario === 'published-api' ? [{published:'8787'}] : []
  }}}));
} else if (command === 'compose build learner-api caddy') {
  process.exit(scenario === 'build-failed' ? 17 : 0);
} else if (args[0] === 'image' && command.includes('org.opencontainers.image.revision')) {
  console.log(scenario === 'stale-image' ? 'old-release' : revision);
} else if (args[0] === 'image' && command.includes('{{.Id}}')) {
  console.log(args.at(-1) === 'lrnki-caddy' ? 'sha256:caddy' : 'sha256:api');
} else if (args.slice(0, 3).join(' ') === 'compose ps -aq') {
  console.log(args.at(-1) + '-container');
} else if (args[0] === 'inspect' && command.includes('.State.Health')) {
  console.log(scenario === 'unhealthy-postgres' ? 'unhealthy' : 'healthy');
} else if (args[0] === 'inspect' && command.includes('{{.Image}}')) {
  console.log(args.at(-1) === 'caddy-container' ? 'sha256:caddy' : 'sha256:api');
} else if (args[0] === 'wait') {
  console.log(scenario === 'migration-refused' ? '1' : '0');
} else if (command === 'compose exec -T learner-api printenv BETTER_AUTH_URL') {
  console.log('https://api.lrnki.globesoul.com');
} else if (args[0] === 'cp') {
  writeFileSync(args.at(-1), '<html>prepared release</html>');
} else if (args[0] === 'run' || args[0] === 'logs' ||
  args.slice(0,2).join(' ') === 'compose up' ||
  args.slice(0,4).join(' ') === 'compose exec -T learner-api') {
  process.exit(0);
} else {
  console.error('Unexpected Docker operation:', command);
  process.exit(99);
}
`;

function run(scenario) {
  mkdirSync(join(repo, "tmp"), { recursive: true });
  const directory = mkdtempSync(join(repo, "tmp/deploy-script-test."));
  try {
    const bin = join(directory, "bin");
    mkdirSync(bin);
    mkdirSync(join(directory, "scripts"));
    const executable = (name, body) => writeFileSync(join(bin, name), body, { mode: 0o755 });
    executable("docker", docker);
    executable("pgrep", "#!/bin/sh\nexit 1\n");
    executable("git", `#!/bin/sh\ncase "$1" in\nstatus) exit 0;;\nrev-parse) echo '${revision}';;\n*) exit 99;;\nesac\n`);
    executable("curl", `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const output = args.indexOf('-o');
if (output >= 0) writeFileSync(args[output + 1], '<html>prepared release</html>');
`);
    copyFileSync(join(repo, "scripts/deploy-learner-api.sh"), join(directory, "scripts/deploy-learner-api.sh"));
    const trace = join(directory, "trace.jsonl");
    const result = spawnSync("bash", [join(directory, "scripts/deploy-learner-api.sh")], {
      encoding: "utf8",
      timeout: 15_000,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        DEPLOY_TEST_TRACE: trace,
        DEPLOY_TEST_SCENARIO: scenario,
        LRNKI_SKIP_GIT_PULL: "1",
        LRNKI_SKIP_BUILD: "0",
        LRNKI_API_HEALTH_URL: "https://api.lrnki.globesoul.com/health",
        LRNKI_WEB_URL: "https://lrnki.globesoul.com"
      }
    });
    assert.ifError(result.error);
    return {
      status: result.status,
      output: result.stdout + result.stderr,
      operations: readFileSync(trace, "utf8").trim().split("\n").map(line => JSON.parse(line))
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const starts = result => result.operations.filter(args => args[0] === "compose" && args[1] === "up");

test("a matched release replaces only application services and keeps the existing PostgreSQL container", () => {
  const result = run("success");
  assert.equal(result.status, 0, result.output);
  assert.deepEqual(starts(result).map(args => args.at(-1)), ["migrate", "learner-api", "caddy"]);
  assert.ok(starts(result).every(args => args.includes("-d") && args.includes("--no-deps")));
  assert.match(result.output, /reusing healthy PostgreSQL container postgres-container/);
  assert.match(result.output, new RegExp(`deployed ${revision}`));
});

test("a migration refusal leaves both old application containers untouched", () => {
  const result = run("migration-refused");
  assert.notEqual(result.status, 0);
  assert.deepEqual(starts(result).map(args => args.at(-1)), ["migrate"]);
  assert.match(result.output, /API was left untouched/);
});

for (const scenario of ["build-failed", "stale-image", "unhealthy-postgres", "published-api"]) {
  test(`${scenario} refuses deployment before starting any service`, () => {
    const result = run(scenario);
    assert.notEqual(result.status, 0);
    assert.deepEqual(starts(result), []);
  });
}
