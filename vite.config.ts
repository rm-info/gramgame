import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		// Écoute sur toutes les interfaces (utile pour les machines de dev headless
		// auxquelles on accède depuis un autre poste sur le LAN).
		host: true,
		// 5174 (et non 5173) parce que synth-app occupe 5173 et que les deux
		// vite dev servers cohabitent sur belzebold via Caddy.
		port: 5174,
		strictPort: true,
		// Hostnames autorisés (protection anti-DNS-rebinding). Préfixe `.` = wildcard
		// de suffixe : `.ts.net` couvre tout le tailnet, `.local` couvre mDNS/Bonjour.
		allowedHosts: ['localhost', 'belzebold', '.ts.net', '.local', 'gramgame-dev.lab.rm-info.fr']
	}
});
