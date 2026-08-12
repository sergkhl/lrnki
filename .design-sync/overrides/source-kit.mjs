// forked from design-sync lib/source-kit.mjs — assign DS pane groups from a repo
// taxonomy instead of the src directory name.
//
// Upstream derives a component's group from the last meaningful src/ path segment.
// Every component here lives in exactly src/ui/ or src/components/, both of which are
// on upstream's GENERIC_DIR list, so all 60 would land in a single "general" group.
// The other documented lever — a cfg.docsMap stub carrying `category:` frontmatter —
// is not usable: a doc body REPLACES the synthesized .prompt.md (emit.mjs), which would
// cost every component its source JSDoc, variant list, Examples and Related sections.
//
// The only change is the GROUPS table and the three lines marked "fork" in the group
// assignment; everything else is the bundled module verbatim, so upstream stays easy
// to re-merge. Relative imports are repointed at the staged lib (./bundle.mjs is the
// sibling fork and resolves here, which keeps one resolveDistEntry).

import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { Project, Node, ts } from 'ts-morph';
import { leadingJsdoc, readText, slash, walk } from '../../.ds-sync/lib/common.mjs';
import { resolveDistEntry } from './bundle.mjs';
import { exportedNames, isComponentName } from '../../.ds-sync/lib/dts.mjs';

// ── fork: repo taxonomy. Keyed by component name; anything unlisted falls through
// to the upstream path-derived group. Mirrors the learner surfaces in CONTEXT.md.
const GROUPS = {
  // src/ui — the app-owned UI boundary (ESLint blocks raw RN equivalents outside it).
  Text: 'Primitives', Badge: 'Primitives', Card: 'Primitives', Input: 'Primitives',
  Progress: 'Primitives', Screen: 'Primitives', RouteStatus: 'Primitives',
  Button: 'Primitives', IconButton: 'Primitives', PressableSurface: 'Primitives',
  AnimatedView: 'Primitives',
  Dialog: 'Overlays', DialogBody: 'Overlays', DialogFooter: 'Overlays',
  FullScreenDialog: 'Overlays', OverlayHeader: 'Overlays', SideSheet: 'Overlays',
  BottomSheet: 'Overlays',
  // The expedition map surface.
  CheckpointCircle: 'Expedition Map', CheckpointPath: 'Expedition Map',
  ConceptMarker: 'Expedition Map', MapParchment: 'Expedition Map', MapFrame: 'Expedition Map',
  QuestHeader: 'Expedition Map', ExpeditionEntry: 'Expedition Map', CandidateCard: 'Expedition Map',
  PlanExpeditionSheet: 'Expedition Map', SectionOverview: 'Expedition Map',
  GuardianTrailNode: 'Expedition Map', GuardianLegRow: 'Expedition Map',
  SupportPathNode: 'Support Paths', SupportPathsPanel: 'Support Paths',
  SupportPathDialog: 'Support Paths', SupportPathSheet: 'Support Paths',
  // Crystal Formation.
  CrystalFormationScene: 'Crystal Formation', FormationSummitStrip: 'Crystal Formation',
  CrystalSpecimen: 'Crystal Formation', CrystalSpecimenGroup: 'Crystal Formation',
  CrystalVista: 'Crystal Formation', LegFormationScene: 'Crystal Formation',
  // Guardian encounter.
  CrystalGuardian: 'Guardian', GuardianFight: 'Guardian',
  GuardianArrivalDialog: 'Guardian', GuardianReward: 'Guardian',
  // Study loop.
  ActivitySheet: 'Study', OptionSelectBody: 'Study', ImpostorBody: 'Study',
  MatchingBoard: 'Study', TileButton: 'Study', LessonSections: 'Study',
  ExplorableTheoryText: 'Study', GroundedBadge: 'Study', GenerationProgressCard: 'Study',
  // Shell, identity, standings.
  SignInGate: 'Learner Shell', ExplorerNameGate: 'Learner Shell',
  LearnerMenuSheet: 'Learner Shell', LeaderboardBoard: 'Learner Shell',
  ChaseBanner: 'Learner Shell', LeaderboardDialog: 'Learner Shell',
  JournalSplashCoordinator: 'Learner Shell',
};
// ── end fork table ───────────────────────────────────────────────────────

const NON_IMPL_RX = /\.(stories|test|spec)\./;
const SRC_IMPL_RX = /\.(tsx|jsx)$/;
const GENERIC_DIR = new Set(['components', 'component', 'src', 'lib', 'ui', 'packages', 'react']);
const slug = (s) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'general';

function deriveComponentsFromSrc(srcFiles) {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, allowJs: true, skipLibCheck: true },
  });
  const seen = new Set();
  for (const p of srcFiles) {
    if (NON_IMPL_RX.test(p) || !SRC_IMPL_RX.test(p)) continue;
    const sf = project.addSourceFileAtPathIfExists(p);
    if (!sf) continue;
    for (const [name, decls] of sf.getExportedDeclarations()) {
      const real = name === 'default'
        ? decls.map((d) => d.getName?.()).find((n) => n && n !== 'default')
        : name;
      if (!real || !/^[A-Z][A-Za-z0-9]*$/.test(real)) continue;
      if (decls.some((d) => Node.isVariableDeclaration(d) || Node.isFunctionDeclaration(d) || Node.isClassDeclaration(d))) {
        seen.add(real);
      }
    }
  }
  return [...seen].sort().map((name) => ({ name, group: 'general' }));
}

export async function resolvePackage(ctx) {
  const { PKG_DIR, pkgJson, ENTRY_OVERRIDE, PKG, OUT, cfg } = ctx;
  const srcMap = cfg.componentSrcMap ?? {};

  const srcRoot = [cfg.srcDir, 'src', 'lib', 'components']
    .map((d) => d && resolve(PKG_DIR, d))
    .find((d) => d && existsSync(d));
  const srcFiles = srcRoot ? walk(srcRoot, (n) => /\.(tsx|jsx|mdx?)$/.test(n)) : [];

  let entry = resolveDistEntry({ pkgDir: PKG_DIR, pkgJson, override: ENTRY_OVERRIDE, pkgName: PKG, soft: true });
  let synthEntry = false;
  if (!entry) {
    if (!srcRoot) {
      console.error(`[NO_DIST] ${PKG} has no built entry and no src/ to synthesize from — run its build.`);
      process.exit(1);
    }
    const comps = srcFiles.filter((p) => SRC_IMPL_RX.test(p) && !NON_IMPL_RX.test(p));
    entry = join(OUT, '.pkg-entry.mjs');
    writeFileSync(entry, comps.map((p) => `export * from ${JSON.stringify(p)};`).join('\n') + '\n');
    synthEntry = true;
    console.error(
      `[NO_DIST] no built entry — synthesizing from ${comps.length} src files (run the package's build for best results)`,
    );
  }

  const exported = exportedNames(PKG_DIR, pkgJson);
  const names = new Set([...exported].filter(isComponentName));
  for (const [k, v] of Object.entries(srcMap)) {
    if (v === null) { names.delete(k); continue; }
    if (!/^[A-Z][A-Za-z0-9]*$/.test(k)) {
      console.error(`[CONFIG] componentSrcMap: "${k}" is not a valid component name (PascalCase identifiers only)`);
      continue;
    }
    names.add(k);
  }
  let components = [...names].sort().map((name) => ({ name, group: 'general' }));
  if (!components.length && synthEntry) {
    components = deriveComponentsFromSrc(srcFiles).filter((c) => srcMap[c.name] !== null);
  }
  if (!components.length) {
    if (cfg.cssEntry || existsSync(join(PKG_DIR, 'styles.css'))) {
      console.error('[ZERO_MATCH] no component exports — treating as tokens-only DS');
      return { shape: 'package', entry, components: [], tokensOnly: true };
    }
    console.error(`[ZERO_MATCH] no PascalCase exports in ${PKG} and no styles — nothing to sync`);
    process.exit(1);
  }

  if (srcRoot) {
    for (const c of components) {
      let hit = typeof srcMap[c.name] === 'string' ? slash(resolve(PKG_DIR, srcMap[c.name])) : null;
      if (!hit) {
        const kebab = c.name.replace(/([a-z0-9])([A-Z])/g, '$1-$2');
        const nameRx = new RegExp(
          `(?:^|/)(?:${c.name}/(?:index|${c.name})\\.(tsx|jsx)|(?:${c.name}|${kebab})\\.(tsx|jsx))$`,
          'i',
        );
        const hits = srcFiles
          .filter((p) => nameRx.test(p) && !NON_IMPL_RX.test(p))
          .sort(
            (a, b) =>
              (b.toLowerCase().includes(`/${c.name.toLowerCase()}/`) ? 1 : 0) -
              (a.toLowerCase().includes(`/${c.name.toLowerCase()}/`) ? 1 : 0),
          );
        const exportRx = new RegExp(`export\\s+(?:default\\s+)?(?:const|let|var|function|class)\\s+${c.name}\\b`);
        hit = hits.find((p) => exportRx.test(readText(p))) ?? hits[0];
      }
      if (!hit || !existsSync(hit)) continue;
      c.srcPath = hit;
      c.doc = leadingJsdoc(readText(hit), c.name) || undefined;
      // fork: repo taxonomy wins; unlisted names keep the upstream derivation.
      if (GROUPS[c.name]) { c.group = slug(GROUPS[c.name]); continue; }
      c.group = slug(
        slash(relative(srcRoot, dirname(hit)))
          .split('/')
          .filter((s) => s && s.toLowerCase() !== c.name.toLowerCase() && !GENERIC_DIR.has(s.toLowerCase()))
          .at(-1)
        || (c.doc && /@category\s+(\S+)/.exec(c.doc)?.[1])
        || 'general',
      );
    }
  }

  console.error(
    `  package: ${components.length} components` +
      (srcRoot ? ` (${components.filter((c) => c.srcPath).length} src-matched)` : ' (no src/ — dist-only)'),
  );
  return { shape: 'package', entry, components, synthEntry, exported };
}
