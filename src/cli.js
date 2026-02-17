const fs = require("fs");
const path = require("path");
const { bundleEntries } = require("./bundler");

function printHelp() {
  console.log("Usage: polybundle [init] [--out <file>]");
}

function initScriptTree(scriptTreePath) {
  const example = [
    "./dev/init1.lua",
    "./dev/init2.lua"
  ];

  if (!fs.existsSync(scriptTreePath)) {
    fs.writeFileSync(scriptTreePath, JSON.stringify(example, null, 2) + "\n", "utf8");
    console.log("Created init_scripts.json with example entries.");
  } else {
    console.log("init_scripts.json already exists.");
  }

  const devDir = path.resolve(path.dirname(scriptTreePath), "dev");
  const libDir = path.join(devDir, "lib");

  fs.mkdirSync(libDir, { recursive: true });

  const init1Path = path.join(devDir, "init1.lua");
  const init2Path = path.join(devDir, "init2.lua");
  const libraryPath = path.join(libDir, "library1.module.lua");

  const init1Content = "local lib = require(\"./lib/library1.module.lua\")\n\n" +
    "local addResult = lib.Add(2, 50)\n\n" +
    "print(addResult)\n" +
    "print(\"added successfully in init1\")\n";

  const init2Content = "local addLib = require(\"./lib/library1.module.lua\")\n\n" +
    "local addResult = addLib.Add(9, 10)\n\n" +
    "local res = \"add result is \"\n\n" +
    "local final = res .. tostring(addResult)\n\n" +
    "print(final)\n";

  const libraryContent = "local returnedLib = {}\n\n" +
    "returnedLib.Add = function(a, b)\n" +
    "    return a + b\n" +
    "end\n\n" +
    "return returnedLib\n";

  if (!fs.existsSync(init1Path)) {
    fs.writeFileSync(init1Path, init1Content, "utf8");
  }

  if (!fs.existsSync(init2Path)) {
    fs.writeFileSync(init2Path, init2Content, "utf8");
  }

  if (!fs.existsSync(libraryPath)) {
    fs.writeFileSync(libraryPath, libraryContent, "utf8");
  }
}

function parseArgs(args) {
  const result = {
    command: null,
    outFile: null,
    help: false
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg === "--out") {
      result.outFile = args[i + 1] || null;
      i += 1;
    } else if (!result.command) {
      result.command = arg;
    }
  }

  return result;
}

function run(args) {
  const options = parseArgs(args);

  if (options.help) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const scriptTreePath = path.resolve(cwd, "init_scripts.json");

  if (options.command === "init") {
    initScriptTree(scriptTreePath);
    return;
  }

  if (!fs.existsSync(scriptTreePath)) {
    console.log("init_scripts.json not found. Run `polybundle init` first.");
    process.exitCode = 1;
    return;
  }

  let entries;
  try {
    const raw = fs.readFileSync(scriptTreePath, "utf8");
    entries = JSON.parse(raw);
  } catch (error) {
    console.error("Failed to read init_scripts.json:", error.message);
    process.exitCode = 1;
    return;
  }

  if (!Array.isArray(entries) || !entries.every((value) => typeof value === "string")) {
    console.error("init_scripts.json must be an array of string paths.");
    process.exitCode = 1;
    return;
  }

  const outFile = options.outFile
    ? path.resolve(cwd, options.outFile)
    : path.resolve(cwd, "dist", "bundle.lua");

  try {
    // save output file, warn user about localscript string lenght limit if output exceeds 65,535 characters
    const bundled = bundleEntries(entries, cwd);
    if (bundled.length > 65535) {
      console.warn(
        "Warning: Output exceeds 65,535 characters, which is the limit for LocalScripts in Polytoria.\n" +
        "Consider splitting your code into multiple bundles or optimizing your code to reduce size."
      );
    }
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, bundled, "utf8");
    console.log(`Bundled ${entries.length} entries into ${outFile}`);
  } catch (error) {
    console.error("Bundling failed:", error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  run
};
