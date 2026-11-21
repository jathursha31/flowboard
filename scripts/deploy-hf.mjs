// 🤗 Hugging Face Spaces ku deploy (card venaam, Docker la oadum)
// Use: npm run deploy:hf -- <hf-username>/<space-name>     (udharanam: npm run deploy:hf -- jathursha31/flowboard)
//
// GitHub repo ah maaththaadhu: kadaisi commit (HEAD) ah oru temp folder la copy panni,
//  1) README mele Space settings (sdk: docker, app_port) serththu
//  2) png / jpg ah Git LFS la vechu (Hugging Face binary files ah LFS illaama edukkaadhu)
//  3) Space repo ku push pannum. Mudhal thadavai login kekkum: username + "write" access token
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const space = process.argv[2] || process.env.HF_SPACE;
if (!space || !/^[\w.-]+\/[\w.-]+$/.test(space)) {
  console.error('❌ Space peru kudunga: npm run deploy:hf -- <hf-username>/<space-name>');
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (args, cwd = root) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' }).trim();

if (git(['status', '--porcelain'])) console.warn('⚠️ Commit pannaadha maatrangal irukku: avai deploy aagaadhu (kadaisi commit mattum pogum).');
const sha = git(['rev-parse', '--short', 'HEAD']);

// 1) Kadaisi commit ah temp folder ku (.git illaama)
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowboard-hf-'));
git(['clone', '--quiet', '--depth', '1', `file://${root.replaceAll('\\', '/')}`, dir], os.tmpdir());
fs.rmSync(path.join(dir, '.git'), { recursive: true, force: true });

// 2) Space settings: Dockerfile la PORT 3001, adhanaala app_port 3001
const readme = path.join(dir, 'README.md');
const frontmatter = ['---', 'title: Flowboard', 'emoji: 📋', 'colorFrom: indigo', 'colorTo: blue', 'sdk: docker', 'app_port: 3001', 'pinned: false', '---', ''].join('\n');
fs.writeFileSync(readme, frontmatter + fs.readFileSync(readme, 'utf8'));
fs.writeFileSync(path.join(dir, '.gitattributes'), '*.png filter=lfs diff=lfs merge=lfs -text\n*.jpg filter=lfs diff=lfs merge=lfs -text\n*.jpeg filter=lfs diff=lfs merge=lfs -text\n');

// 3) Pudhu repo + push (force: Space la eppovum indha commit oda copy)
git(['init', '--quiet', '-b', 'main'], dir);
git(['lfs', 'install', '--local'], dir);
git(['add', '-A'], dir);
git(['commit', '--quiet', '-m', `Deploy ${sha}`], dir);
if (process.argv.includes('--dry-run')) {
  console.log(`🧪 Dry run: ${dir} ready (push pannala)`);
  process.exit(0);
}
console.log(`🚀 ${sha} ah https://huggingface.co/spaces/${space} ku anuppuren...`);
execFileSync('git', ['push', '--force', `https://huggingface.co/spaces/${space}`, 'main'], { cwd: dir, stdio: 'inherit' });
fs.rmSync(dir, { recursive: true, force: true });

const [user, name] = space.toLowerCase().split('/');
console.log(`✅ Anuppiyaachu! Build 5–10 nimisham. Website: https://${user}-${name.replaceAll(/[._]/g, '-')}.hf.space`);
