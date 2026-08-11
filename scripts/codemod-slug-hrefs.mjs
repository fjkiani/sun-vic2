// codemod-slug-hrefs — replace hand-built /documents/<uuid> and /projects/<uuid> links with
// the slug helpers, so there is exactly one place that decides what an address looks like.
//
// Only rewrites the shape `/documents/${X.id}` where X is the record itself. A bare id
// variable (MilestoneWorkflow's `newId`, EmailsList's `e.document_id`) is deliberately left
// alone: those callers do not hold the record, and a UUID address still resolves.
//
//   node scripts/codemod-slug-hrefs.mjs [--check]

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CHECK = process.argv.includes('--check');

const TARGETS = [
  ['src/pages/DocumentsListPage.jsx', ['doc']],
  ['src/pages/NewDocumentPage.jsx', ['doc']],
  ['src/pages/ChatThreadPage.jsx', ['doc']],
  ['src/pages/CopilotPage.jsx', ['doc']],
  ['src/pages/ProjectsListPage.jsx', ['project']],
  ['src/components/copilot/ReviewCard.jsx', ['doc']],
  ['src/components/copilot/AgentActivityFeed.jsx', ['doc']],
  ['src/components/copilot/BusinessDashboard.jsx', ['doc']],
  ['src/components/work/WorkRows.jsx', ['doc', 'project']],
  ['src/components/dashboard/ProjectCopilotCard.jsx', ['doc']],
  ['src/components/dashboard/PipelineKanban.jsx', ['doc']],
  ['src/components/dashboard/MilestoneTimeline.jsx', ['doc']],
  ['src/components/project/MilestoneWorkflow.jsx', ['doc']],
];

const DOC_RE = /`\/documents\/\$\{([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[\d+\])*)\.id\}`/g;
const PROJ_RE = /`\/projects\/\$\{([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[\d+\])*)\.id\}`/g;

function importLine(file, names) {
  const from = path.dirname(path.join(ROOT, file));
  let rel = path.relative(from, path.join(ROOT, 'src/lib/slugs.js'));
  if (!rel.startsWith('.')) rel = './' + rel;
  return `import { ${names.join(', ')} } from '${rel}';`;
}

let files = 0, docHits = 0, projHits = 0, skipped = [];

for (const [file, kinds] of TARGETS) {
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) { skipped.push(`${file}: missing`); continue; }
  const before = fs.readFileSync(abs, 'utf8');
  let src = before;

  let d = 0, p = 0;
  if (kinds.includes('doc')) src = src.replace(DOC_RE, (_m, expr) => { d++; return `docHref(${expr})`; });
  if (kinds.includes('project')) src = src.replace(PROJ_RE, (_m, expr) => { p++; return `projectHref(${expr})`; });

  if (d + p === 0) { skipped.push(`${file}: no matching href`); continue; }

  const needed = [];
  if (d && !/\bdocHref\b.*from ['"].*slugs\.js['"]/.test(src)) needed.push('docHref');
  if (p && !/\bprojectHref\b.*from ['"].*slugs\.js['"]/.test(src)) needed.push('projectHref');
  if (needed.length) {
    const existing = src.match(/^import \{([^}]*)\} from ['"][^'"]*slugs\.js['"];$/m);
    if (existing) {
      const have = existing[1].split(',').map((s) => s.trim()).filter(Boolean);
      const merged = [...new Set([...have, ...needed])].sort();
      src = src.replace(existing[0], importLine(file, merged));
    } else {
      // after the final top-of-file import so the block stays contiguous
      const imports = [...src.matchAll(/^import .*?;$/gm)];
      const last = imports[imports.length - 1];
      if (!last) { skipped.push(`${file}: no import block`); continue; }
      const at = last.index + last[0].length;
      src = src.slice(0, at) + '\n' + importLine(file, needed.sort()) + src.slice(at);
    }
  }

  docHits += d; projHits += p;
  if (src !== before) {
    files++;
    if (!CHECK) fs.writeFileSync(abs, src);
    console.log(`${CHECK ? 'would patch' : 'patched'}  ${file}  (${d} doc, ${p} project)`);
  }
}

console.log(`\n${CHECK ? 'would rewrite' : 'rewrote'} ${docHits} document href(s) and ${projHits} project href(s) across ${files} file(s)`);
for (const s of skipped) console.log(`  skipped ${s}`);

// Anything still hand-building an address from a record we hold is a miss.
const leftovers = [];
for (const [file] of TARGETS) {
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) continue;
  const src = fs.readFileSync(abs, 'utf8');
  for (const re of [DOC_RE, PROJ_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) leftovers.push(`${file}: ${m[0]}`);
  }
}
if (leftovers.length && !CHECK) {
  console.log(`\nUNRESOLVED (${leftovers.length}):`);
  for (const l of leftovers) console.log('  ' + l);
  process.exit(1);
}
