import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		// Écoute sur toutes les interfaces (utile pour les machines de dev headless
		// auxquelles on accède depuis un autre poste sur le LAN).
		host: true,
		port: 5173,
		strictPort: false
	}
});
