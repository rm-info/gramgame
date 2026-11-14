// Charge les modules de pb_hooks/lib dans Node (hors PocketBase) pour les tests :
// émule `module.exports` et `require(`${__hooks}/lib/x.js`)`.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HOOKS = path.join(__dirname, '..', 'pb_hooks');
const cache = {};

function load(file) {
	const full = path.resolve(file);
	if (cache[full]) return cache[full];
	const module = { exports: {} };
	cache[full] = module.exports;
	const code = fs.readFileSync(full, 'utf8');
	const fn = vm.runInThisContext(`(function (module, exports, require, __hooks) {\n${code}\n})`, { filename: full });
	fn(module, module.exports, (p) => load(p), HOOKS);
	cache[full] = module.exports;
	return module.exports;
}

module.exports = (name) => load(path.join(HOOKS, 'lib', name));
