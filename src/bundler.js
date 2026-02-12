const fs = require("fs");
const path = require("path");

const requireRegex = /require\s*\(\s*(['"])(.*?)\1\s*\)/g;

function normalizeLuaSource(source) {
  return source.endsWith("\n") ? source : source + "\n";
}

function isModuleFile(filePath) {
  return filePath.endsWith(".module.lua");
}

function toLuaKey(filePath, rootDir) {
  const relative = path.relative(rootDir, filePath);
  return relative.split(path.sep).join("/");
}

function resolveModulePath(request, fromDir, rootDir) {
  const hasExtension = request.endsWith(".lua") || request.endsWith(".module.lua");
  const withExtension = hasExtension ? request : `${request}.module.lua`;

  let candidate;
  if (path.isAbsolute(withExtension)) {
    candidate = withExtension;
  } else if (withExtension.startsWith("./") || withExtension.startsWith("../")) {
    candidate = path.resolve(fromDir, withExtension);
  } else if (withExtension.startsWith("/")) {
    candidate = path.resolve(rootDir, withExtension.slice(1));
  } else {
    candidate = path.resolve(rootDir, withExtension);
  }

  if (fs.existsSync(candidate)) {
    return candidate;
  }

  if (!hasExtension) {
    const fallback = candidate.replace(/\.module\.lua$/, ".lua");
    if (fs.existsSync(fallback)) {
      return fallback;
    }
  }

  throw new Error(`Module not found for require("${request}")`);
}

function collectModulesFromSource(source, filePath, rootDir, moduleList, moduleSet, stack) {
  return source.replace(requireRegex, (match, quote, request) => {
    const modulePath = resolveModulePath(request, path.dirname(filePath), rootDir);
    if (stack.includes(modulePath)) {
      const cycle = [...stack, modulePath]
        .map((entry) => path.relative(rootDir, entry))
        .join(" -> ");
      throw new Error(`Circular require detected: ${cycle}`);
    }

    if (!moduleSet.has(modulePath)) {
      moduleSet.add(modulePath);
      moduleList.push(modulePath);
      const moduleSource = fs.readFileSync(modulePath, "utf8");
      collectModulesFromSource(moduleSource, modulePath, rootDir, moduleList, moduleSet, stack.concat(modulePath));
    }

    return match;
  });
}

function replaceRequiresWithModuleRefs(source, filePath, rootDir, moduleKeyMap) {
  return source.replace(requireRegex, (match, quote, request) => {
    const modulePath = resolveModulePath(request, path.dirname(filePath), rootDir);
    const moduleKey = moduleKeyMap.get(modulePath);
    if (!moduleKey) {
      throw new Error(`Missing module entry for require(\"${request}\")`);
    }
    return `__module_env[\"${moduleKey}\"]`;
  });
}

function bundleModuleSource(source, filePath, rootDir, moduleKeyMap, cache, stack) {
  if (cache.has(filePath)) {
    return cache.get(filePath);
  }

  if (stack.includes(filePath)) {
    const cycle = [...stack, filePath].map((entry) => path.relative(rootDir, entry)).join(" -> ");
    throw new Error(`Circular require detected: ${cycle}`);
  }

  const nextStack = stack.concat(filePath);
  const replaced = replaceRequiresWithModuleRefs(source, filePath, rootDir, moduleKeyMap);
  cache.set(filePath, replaced);
  return replaced;
}

function bundleEntries(entries, rootDir) {
  const moduleList = [];
  const moduleSet = new Set();

  for (const entry of entries) {
    const entryPath = path.resolve(rootDir, entry);
    if (isModuleFile(entryPath)) {
      if (!moduleSet.has(entryPath)) {
        moduleSet.add(entryPath);
        moduleList.push(entryPath);
        const moduleSource = fs.readFileSync(entryPath, "utf8");
        collectModulesFromSource(moduleSource, entryPath, rootDir, moduleList, moduleSet, [entryPath]);
      }
      continue;
    }

    const source = fs.readFileSync(entryPath, "utf8");
    collectModulesFromSource(source, entryPath, rootDir, moduleList, moduleSet, [entryPath]);
  }

  const moduleKeyMap = new Map();
  for (const modulePath of moduleList) {
    moduleKeyMap.set(modulePath, toLuaKey(modulePath, rootDir));
  }

  const moduleCache = new Map();
  const chunks = [];

  chunks.push("local __module_env = {}\n");

  for (const modulePath of moduleList) {
    const moduleSource = fs.readFileSync(modulePath, "utf8");
    const bundledModule = bundleModuleSource(moduleSource, modulePath, rootDir, moduleKeyMap, moduleCache, []);
    const moduleKey = moduleKeyMap.get(modulePath);
    const header = `-- polybundle: module ${moduleKey}\n`;
    const assignment = `__module_env[\"${moduleKey}\"] = (function()\n${normalizeLuaSource(bundledModule)}end)()\n`;
    chunks.push(header + assignment);
  }

  for (const entry of entries) {
    const entryPath = path.resolve(rootDir, entry);
    if (isModuleFile(entryPath)) {
      continue;
    }

    const entrySource = fs.readFileSync(entryPath, "utf8");
    const replaced = replaceRequiresWithModuleRefs(entrySource, entryPath, rootDir, moduleKeyMap);
    const wrapped = `coroutine.wrap(function()\n${normalizeLuaSource(replaced)}end)()`;
    const header = `-- polybundle: begin ${path.relative(rootDir, entryPath)}\n`;
    const footer = `-- polybundle: end ${path.relative(rootDir, entryPath)}\n`;
    chunks.push(header + normalizeLuaSource(wrapped) + footer);
  }

  return chunks.join("\n");
}

module.exports = {
  bundleEntries
};
