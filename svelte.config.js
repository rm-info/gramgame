import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		// Le build est servi directement par PocketBase (dossier pb_public).
		// PocketBase renvoie index.html pour toute route inconnue (fallback SPA).
		adapter: adapter({
			pages: 'pocketbase/pb_public',
			assets: 'pocketbase/pb_public',
			fallback: '404.html'
		}),
		// Chemins d'assets absolus (/_app/…) : indispensable pour que le
		// fallback index.html fonctionne sur les routes profondes (/exercise/xxx).
		paths: { relative: false }
	}
};

export default config;
