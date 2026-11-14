import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		// SPA pure (ssr = false, aucune page prérendue) : le build ne contient
		// qu'un index.html, servi par PocketBase pour toute route inconnue
		// (dossier pb_public). Prérendre des pages casserait ce fallback :
		// PocketBase renverrait la page d'accueil pour /login, /exercise/…
		adapter: adapter({
			pages: 'pocketbase/pb_public',
			assets: 'pocketbase/pb_public',
			fallback: 'index.html'
		}),
		// Chemins d'assets absolus (/_app/…) : indispensable pour que le
		// fallback index.html fonctionne sur les routes profondes (/exercise/xxx).
		paths: { relative: false }
	}
};

export default config;
