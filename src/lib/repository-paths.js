'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const ROOTS_FILE = '.aioson/repository-roots.json';

function contains(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function readRoots(targetDir) {
  try {
    const config = JSON.parse(await fs.readFile(path.join(targetDir, ROOTS_FILE), 'utf8'));
    if (config?.version !== 1 || !Array.isArray(config.roots)
      || config.roots.some((root) => typeof root !== 'string' || !root.trim())) {
      throw new Error('expected version: 1 and roots: an array of nonempty paths');
    }
    return config.roots;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw new Error(`${ROOTS_FILE}: ${error.message}`, { cause: error });
  }
}

async function inspectWithin(root, absolute) {
  let current = absolute;
  while (contains(root.absolute, current)) {
    try {
      // lstat distinguishes a missing path from a dangling symlink. A planned
      // create must be contained on disk too, even when its leaf is absent.
      await fs.lstat(current);
      const real = await fs.realpath(current);
      if (!contains(root.real, real)) return { safe: false };
      if (current === absolute) {
        const stat = await fs.stat(absolute);
        return { safe: stat.isFile(), exists: stat.isFile(), stat };
      }
      const stat = await fs.stat(current);
      return { safe: stat.isDirectory(), exists: false };
    } catch (error) {
      if (error.code !== 'ENOENT') return { safe: false };
      // An existing but dangling link cannot authorize its missing target.
      try { await fs.lstat(current); return { safe: false }; } catch (missing) {
        if (missing.code !== 'ENOENT') return { safe: false };
      }
      current = path.dirname(current);
    }
  }
  return { safe: false };
}

/** Project-owned opt-in; a plan's prose or frontmatter cannot grant roots. */
async function loadRepositoryPathPolicy(targetDir) {
  const project = path.resolve(targetDir);
  const roots = [];
  const issues = [];
  try {
    roots.push({ absolute: project, real: await fs.realpath(project) });
    const declared = await readRoots(project);
    for (const value of declared) {
      const absolute = path.resolve(project, value);
      const real = await fs.realpath(absolute);
      if (!(await fs.stat(absolute)).isDirectory()) throw new Error(`not a directory: ${value}`);
      // Grant a specific repository, never its parent or an entire drive.
      if (absolute === project || real === roots[0].real) continue;
      if (contains(absolute, project) || contains(real, roots[0].real)
        || absolute === path.parse(absolute).root || real === path.parse(real).root) {
        throw new Error(`repository root must not contain the project: ${value}`);
      }
      roots.push({ absolute, real });
    }
  } catch (error) {
    issues.push({ check: 'repository_roots_invalid', message: `${ROOTS_FILE}: ${error.message}` });
  }

  return {
    issues,
    async inspect(relativePath) {
      if (issues.length || typeof relativePath !== 'string' || !relativePath
        || relativePath.includes('\0') || path.isAbsolute(relativePath)
        || path.win32.isAbsolute(relativePath) || /^[a-z]:/i.test(relativePath)) {
        return { safe: false };
      }
      const absolute = path.resolve(project, relativePath.replace(/\\/g, '/'));
      // Prefer the narrowest root so an overlapping declaration cannot let
      // a link escape the repository that owns the literal path.
      const root = roots.filter((item) => absolute !== item.absolute && contains(item.absolute, absolute))
        .sort((a, b) => b.absolute.length - a.absolute.length)[0];
      return root ? inspectWithin(root, absolute) : { safe: false };
    }
  };
}

module.exports = { loadRepositoryPathPolicy };
