import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// En dev, PocketBase tourne à côté (./pocketbase/run.sh, par défaut
// 127.0.0.1:8092) : on proxifie l'API et l'admin pour rester en same-origin,
// comme en prod. Pas 8090 : sur belzebold, c'est le PocketBase de phms.
const PB_URL = process.env.PB_URL ?? 'http://127.0.0.1:8092';

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
		allowedHosts: ['localhost', 'belzebold', '.ts.net', '.local', 'gramgame-dev.lab.rm-info.fr'],
		proxy: {
			'/api': { target: PB_URL, changeOrigin: false },
			'/_': { target: PB_URL, changeOrigin: false }
		}
	}
});
