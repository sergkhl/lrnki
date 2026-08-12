// forked from design-sync lib/bundle.mjs — the DS is a React Native (Expo) app, so the
// bundle needs Metro's transform pipeline reproduced in esbuild.
//
// Everything below the "── fork ──" marker is added; the rest is the bundled module
// verbatim (same IIFE/header contract with the app's self-check). Three things Metro
// does that esbuild does not, all folded into sharedBuildOptions so the runtime bundle
// and the export-evidence pass can never resolve differently:
//
//   1. react-native-css's import rewrite (what nativewind/metro installs as a resolver):
//      react-native / react-native-web exports → react-native-css/components, whose
//      wrappers are what turn `className` into RNW $$css style objects. Without it every
//      NativeWind class is silently dropped and the whole DS renders unstyled.
//   2. babel-preset-expo over app source — it owns the Reanimated 4 worklet transform
//      exactly once (see apps/learner-app/babel.config.js) plus the react-native-web alias.
//   3. Metro's platform-extension resolution (.web.tsx before .tsx) and a `process`
//      polyfill, which Metro gives every module and esbuild does not.
//
// react/react-dom stay externalized to window.React exactly as upstream — that is what
// lets the claude.ai/design agent render these components with its own React.

import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IIFE_IMPORT_META_DEFINE } from '../../.ds-sync/lib/common.mjs';

// Resolve the package's browser entry. Prefer ESM (tree-shakes cleaner).
// `soft` → return null on miss instead of exiting (caller synthesizes from src/).
export function resolveDistEntry({ pkgDir, pkgJson, override, pkgName, soft = false }) {
  if (override) {
    const p = resolve(override);
    if (!existsSync(p)) {
      console.error(`[NO_DIST] --entry ${override} doesn't exist — run the DS's build.`);
      if (soft) return null;
      process.exit(1);
    }
    return p;
  }
  const str = (v) => (typeof v === 'string' ? v : v?.default ? str(v.default) : null);
  const cand = [
    pkgJson.module,
    str(pkgJson.exports?.['.']?.import),
    str(pkgJson.exports?.['.']?.default),
    str(pkgJson.exports?.['.']),
    pkgJson.main,
  ].filter((c) => typeof c === 'string');
  for (const c of cand) {
    const p = join(pkgDir, c);
    if (existsSync(p)) return p;
  }
  if (soft) return null;
  console.error(
    `[NO_DIST] ${pkgName} has no built entry (tried ${cand.join(', ')} under ${pkgDir}). ` +
      `Run the DS's build script, or use 'npm install ${pkgName}@latest' in a scratch dir and pass --node-modules.`,
  );
  process.exit(1);
}

// react/react-dom are externals → resolved to window.React / window.ReactDOM.
export const reactShim = {
  name: 'react-global',
  setup(b) {
    b.onResolve({ filter: /^react(\/(jsx-(dev-)?runtime|compiler-runtime))?$/ }, () => ({
      path: 'react-shim',
      namespace: 'shim',
    }));
    b.onResolve({ filter: /^react-dom(\/client)?$/ }, () => ({
      path: 'react-dom-shim',
      namespace: 'shim',
    }));
    b.onResolve({ filter: /^react-is$/ }, () => ({ path: 'react-is-shim', namespace: 'shim' }));
    b.onResolve({ filter: /^scheduler(\/|$)/ }, () => ({ path: 'scheduler-shim', namespace: 'shim' }));
    b.onLoad({ filter: /^react-shim$/, namespace: 'shim' }, () => ({
      contents: `var R=window.React;
function np(p,k){var o={};for(var x in p)if(x!=="children")o[x]=p[x];if(k!==void 0)o.key=k;return o}
function jsx(t,p,k){var c=p&&p.children;return c===void 0?R.createElement(t,np(p,k)):R.createElement(t,np(p,k),c)}
function jsxs(t,p,k){return R.createElement.apply(R,[t,np(p,k)].concat(p.children))}
module.exports=R;
module.exports.jsx=jsx;module.exports.jsxs=jsxs;module.exports.jsxDEV=function(t,p,k,s){return(s?jsxs:jsx)(t,p,k)};
module.exports.Fragment=R.Fragment;`,
      loader: 'js',
    }));
    b.onLoad({ filter: /^react-dom-shim$/, namespace: 'shim' }, () => ({
      contents: 'var D=window.ReactDOM,n=function(){};' +
        'module.exports=Object.assign({preload:n,preinit:n,preconnect:n,prefetchDNS:n,preloadModule:n,preinitModule:n},D);',
      loader: 'js',
    }));
    b.onLoad({ filter: /^react-is-shim$/, namespace: 'shim' }, () => ({
      contents: `var R=window.React;
var FWD=Symbol.for("react.forward_ref"),MEMO=Symbol.for("react.memo"),PORTAL=Symbol.for("react.portal"),LAZY=Symbol.for("react.lazy");
function tt(o){return o!=null&&typeof o==="object"?(R.isValidElement(o)?(o.type&&o.type.$$typeof)||o.type:o.$$typeof):undefined}
exports.typeOf=tt;
exports.isElement=R.isValidElement;
exports.isValidElementType=function(t){return typeof t==="string"||typeof t==="function"||t===R.Fragment||t===R.Suspense||t===R.StrictMode||t===R.Profiler||(t!=null&&typeof t==="object"&&t.$$typeof!=null)};
exports.isFragment=function(o){return R.isValidElement(o)&&o.type===R.Fragment};
exports.isSuspense=function(o){return R.isValidElement(o)&&o.type===R.Suspense};
exports.isPortal=function(o){return o!=null&&o.$$typeof===PORTAL};
exports.isForwardRef=function(o){return tt(o)===FWD};
exports.isMemo=function(o){return tt(o)===MEMO};
exports.isLazy=function(o){return tt(o)===LAZY};
exports.isContextProvider=exports.isContextConsumer=exports.isProfiler=exports.isStrictMode=function(){return false};
exports.ForwardRef=FWD;exports.Memo=MEMO;exports.Portal=PORTAL;exports.Lazy=LAZY;
exports.Fragment=R.Fragment;exports.Suspense=R.Suspense;exports.StrictMode=R.StrictMode;exports.Profiler=R.Profiler;`,
      loader: 'js',
    }));
    b.onLoad({ filter: /^scheduler-shim$/, namespace: 'shim' }, () => ({
      contents: `throw new Error("[SCHEDULER_MISSING] this DS's dist/ imports 'scheduler' directly — usually react-dom leaked into the dist. Check the DS build's externals.");`,
      loader: 'js',
    }));
  },
};

export function tsconfigPathsPlugin(tsconfigPath) {
  let paths, baseUrl;
  try {
    const raw = readFileSync(tsconfigPath, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    ({ paths, baseUrl = '.' } = JSON.parse(raw).compilerOptions ?? {});
  } catch { return null; }
  if (!paths) return null;
  const base = resolve(dirname(tsconfigPath), baseUrl);
  const rules = Object.entries(paths).map(([k, v]) => ({
    prefix: k.replace(/\*$/, ''),
    targets: (Array.isArray(v) ? v : [v]).map((t) => resolve(base, t.replace(/\*$/, ''))),
    wild: k.endsWith('*'),
  }));
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const filter = new RegExp(`^(?:${rules.map((r) => esc(r.prefix)).join('|')})`);
  const exts = ['', '.web.tsx', '.web.ts', '.tsx', '.ts', '.js', '.jsx', '.mjs', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
  return {
    name: 'tsconfig-paths',
    setup(b) {
      b.onResolve({ filter }, (args) => {
        for (const r of rules) {
          if (r.wild ? !args.path.startsWith(r.prefix) : args.path !== r.prefix) continue;
          const tail = r.wild ? args.path.slice(r.prefix.length) : '';
          for (const t of r.targets) {
            const stem = join(t, tail);
            for (const ext of exts) {
              if (existsSync(stem + ext)) return { path: stem + ext };
            }
          }
        }
        return undefined;
      });
    },
  };
}

// ── fork ─────────────────────────────────────────────────────────────────
// Repo layout is derived from this file's own location so nothing is machine-pinned.
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = join(REPO, 'apps', 'learner-app');
const require_ = createRequire(join(REPO, 'package.json'));
const babel = require_('@babel/core');
const RNC_ROOT = dirname(require_.resolve('react-native-css/package.json'));
// Not on react-native-css's exports map, so resolved as a file path. It is the same
// plugin nativewind/babel re-exports; taken alone because babel-preset-expo already
// owns the worklets half of that pair.
const RNC_IMPORT_PLUGIN = join(RNC_ROOT, 'dist', 'commonjs', 'babel', 'import-plugin.js');
const PROCESS_SHIM = join(REPO, '.design-sync', 'process-shim.js');

const isAppSource = (p) =>
  p.startsWith(APP + sep) && !p.includes(`${sep}node_modules${sep}`);

// bundleToIife and bundleExportEvidence transform the same graph; cache so the
// evidence pass doesn't pay for a second full babel run.
const babelCache = new Map();

const rncResolver = {
  name: 'rnc-resolver',
  setup(b) {
    // Mirrors react-native-css/src/metro/resolver.ts. App source is handled by the
    // babel import-plugin (it runs before babel-preset-expo rewrites the specifier),
    // so this only has to keep every other importer — including react-native-css's
    // own wrappers — pointed at react-native-web, which is what Expo's Metro web
    // config aliases react-native to.
    b.onResolve({ filter: /^react-native$/ }, (args) =>
      b.resolve('react-native-web', { kind: 'import-statement', resolveDir: args.resolveDir }),
    );
    b.onResolve({ filter: /^react-native\// }, (args) => ({
      path: args.path.replace(/^react-native\//, 'react-native-web/'),
      namespace: 'file',
    }));
  },
};

const babelAppSource = {
  name: 'babel-app-source',
  setup(b) {
    b.onLoad({ filter: /\.[jt]sx?$/ }, async (args) => {
      if (!isAppSource(args.path)) return undefined;
      const key = `${args.path}:${statSync(args.path).mtimeMs}`;
      const hit = babelCache.get(key);
      if (hit) return { contents: hit, loader: 'js' };
      const out = await babel.transformAsync(readFileSync(args.path, 'utf8'), {
        filename: args.path,
        babelrc: false,
        configFile: false,
        sourceMaps: false,
        plugins: [RNC_IMPORT_PLUGIN],
        presets: [[require_.resolve('babel-preset-expo'), { platform: 'web' }]],
        caller: {
          name: 'metro',
          platform: 'web',
          isDev: false,
          isServer: false,
          supportsStaticESM: true,
          supportsDynamicImport: true,
        },
      });
      babelCache.set(key, out.code);
      return { contents: out.code, loader: 'js' };
    });
  },
};

function sharedBuildOptions({ nodePaths, tsconfig }) {
  const pathsPlugin = tsconfig ? tsconfigPathsPlugin(tsconfig) : null;
  const plugins = [rncResolver, babelAppSource, reactShim];
  if (pathsPlugin) plugins.unshift(pathsPlugin);
  return {
    bundle: true,
    platform: 'browser',
    target: 'es2020',
    nodePaths: [nodePaths],
    plugins,
    metafile: true,
    // Metro's platform-extension resolution — the app ships .web.tsx variants
    // (e.g. src/ui/sheetBackdrop.web.tsx) that plain esbuild would never pick.
    resolveExtensions: ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs', '.json'],
    // Metro polyfills `process` for every module.
    inject: [PROCESS_SHIM],
    loader: {
      // @rn-primitives/* publish untranspiled JSX in .js/.mjs; Metro babels
      // node_modules, esbuild has to be told.
      '.js': 'jsx',
      '.mjs': 'jsx',
      '.svg': 'dataurl',
      '.png': 'dataurl',
      '.jpg': 'dataurl',
      '.ttf': 'dataurl',
      '.otf': 'dataurl',
      '.woff': 'dataurl',
      '.woff2': 'dataurl',
    },
    minify: false,
    define: {
      'process.env.NODE_ENV': '"development"',
      __DEV__: 'false',
      global: 'globalThis',
      'process.env.EXPO_OS': '"web"',
    },
  };
}
// ── end fork ─────────────────────────────────────────────────────────────

export async function bundleToIife({ entry, globalName, nodePaths, out, tsconfig }) {
  const bundleJs = join(out, '_ds_bundle.js');
  const bundleCss = join(out, '_ds_bundle.css');
  const shared = sharedBuildOptions({ nodePaths, tsconfig });
  let buildResult;
  try {
    buildResult = await build({
      ...shared,
      entryPoints: [entry],
      format: 'iife',
      globalName,
      footer: { js: `window.${globalName}=${globalName}.__dsMainNs?Object.assign({},${globalName},${globalName}.__dsMainNs,{__dsMainNs:undefined}):${globalName};` },
      outfile: bundleJs,
      logLevel: 'warning',
      define: { ...shared.define, ...IIFE_IMPORT_META_DEFINE },
    });
  } catch (e) {
    const unresolved = [...new Set((e.errors ?? []).map((er) => er.text.match(/Could not resolve "([^"]+)"/)?.[1]).filter(Boolean))];
    const siblings = unresolved.filter((p) => {
      const pj = join(nodePaths, p, 'package.json');
      if (!existsSync(pj)) return false;
      try {
        const j = JSON.parse(readFileSync(pj, 'utf8'));
        const ent = j.module ?? j.main ?? 'index.js';
        return !existsSync(join(nodePaths, p, ent));
      } catch { return false; }
    });
    if (siblings.length) {
      console.error(
        `[WORKSPACE_SIBLING] ${siblings.join(', ')} exist in node_modules but aren't built (no dist entry). ` +
          `Run their build, or npm install the published versions.`,
      );
    } else if (unresolved.length) {
      console.error(`[UNRESOLVED_IMPORT] ${unresolved.join(', ')} — missing from node_modules.`);
    }
    throw e;
  }
  const REACT_PKGS = new Set(['react', 'react-dom', 'react-is']);
  const inlinedExternals = [
    ...new Set(
      Object.keys(buildResult?.metafile?.inputs ?? {})
        .map((p) => p.match(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)\//)?.[1])
        .filter((pkg) => pkg && !REACT_PKGS.has(pkg)),
    ),
  ].sort();
  console.error(`  bundle: ${(statSync(bundleJs).size / 1024).toFixed(0)} KB`);
  console.error(`  inlined npm packages: ${inlinedExternals.length}`);
  return { bundleJs, bundleCss, inlinedExternals };
}

export async function bundleExportEvidence({ entry, nodePaths, tsconfig }) {
  try {
    const r = await build({
      ...sharedBuildOptions({ nodePaths, tsconfig }),
      entryPoints: [entry],
      format: 'esm',
      write: false,
      outfile: '__ds_export_evidence.mjs',
      logLevel: 'silent',
    });
    const out = Object.values(r.metafile?.outputs ?? {})[0];
    const exports = new Set((out?.exports ?? []).filter((n) => n !== '__dsMainNs'));
    const cjsPresent = Object.entries(r.metafile?.inputs ?? {}).some(
      ([k, i]) => i.format === 'cjs' && !k.startsWith('shim:'),
    );
    return { exports, cjsPresent };
  } catch {
    return null;
  }
}

export function stampHeader(bundleJs, { namespace, components, inlinedExternals }) {
  const body = readFileSync(bundleJs, 'utf8');
  const out = dirname(bundleJs);
  const sourceHashes = Object.fromEntries(
    components.flatMap((c) => {
      const base = `components/${c.group}/${c.name}/${c.name}`;
      return ['.jsx', '.d.ts', '.prompt.md']
        .map((ext) => base + ext)
        .filter((rel) => existsSync(join(out, rel)))
        .map((rel) => [rel, createHash('sha256').update(readFileSync(join(out, rel))).digest('hex').slice(0, 12)]);
    }),
  );
  const meta = {
    namespace,
    components: components.map((c) => ({
      name: c.name,
      sourcePath: `components/${c.group}/${c.name}/${c.name}.jsx`,
    })),
    sourceHashes,
    inlinedExternals,
    builtBy: 'cc-design-sync',
  };
  const headerJson = JSON.stringify(meta).replace(/\*\//g, '*\\/');
  writeFileSync(bundleJs, `/* @ds-bundle: ${headerJson} */\n` + body);
}
