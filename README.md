# PolyBundle

Simple (heavily clanker-made) Lua script bundler for Polytoria.

## Installation

install globally
```
npm install -g polybundle
```

install from this repo:

```
npm install
npm link
```

## Usage

Initialize a project (creates init_scripts.json and a dev sample):

```
polybundle init
```

Bundle using the current folder's init_scripts.json:

```
polybundle
```

Specify an output file:

```
polybundle --out dist/bundle.lua
```

## init_scripts.json format

An array of entry script paths (order matters):

```json
[
  "./dev/init1.lua",
  "./dev/init2.lua"
]
```

## Example Output:
```lua
local __module_env = {}

-- polybundle: module scripts/lib/library1.module.lua
__module_env["scripts/lib/library1.module.lua"] = (function()
local returnedLib = {}

returnedLib.Add = function(a, b)
    return a + b
end

return returnedLib
end)()

-- polybundle: begin scripts\init1.lua
coroutine.wrap(function()
local lib = __module_env["scripts/lib/library1.module.lua"]

local addResult = lib.Add(2, 50)

print(addResult)
print("added successfully in init1")
end)()
-- polybundle: end scripts\init1.lua

-- polybundle: begin scripts\init2.lua
coroutine.wrap(function()
local addLib = __module_env["scripts/lib/library1.module.lua"]

local addResult = addLib.Add(9, 10)

local res = "add result is "

local final = res .. tostring(addResult)

print(final)
end)()
-- polybundle: end scripts\init2.lua
```
