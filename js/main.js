import { Game } from "./core/Game.js";
import { Input } from "./input/Input.js";
import { Renderer2D } from "./render/Renderer2D.js";
import { MapLoader } from "./world/MapLoader.js";
import { HUD } from "./ui/HUD.js";
import { createWorld } from "./world/createWorld.js";

const GTA2WEB_VERSION = "V2_0_0";
window.GTA2WEB_VERSION = GTA2WEB_VERSION;
console.info(`%c[GTA II Web] ${GTA2WEB_VERSION} — COMPLETE EDITION`, "color:#FFD700;font-weight:bold;font-size:14px;");
console.info("Systèmes: ScriptEngine (7 missions), AudioSystem, OverlaySystem (WASTED/BUSTED + minimap), WeaponSystem (6 armes), ProjectileSystem, PickupSystem, HazardSystem, GangSystem, GarageSystem, PhoneSystem, WantedSystem");

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", { alpha: false });

const input = new Input(window);
input.bindMouse(canvas);

const renderer = new Renderer2D(ctx, canvas);
const hud = new HUD();
const game = new Game({ input, renderer, hud });

async function boot() {
  const map = await MapLoader.loadJSON("assets/maps/grenoble.json");
  const world = createWorld({ map });

  // Activation audio sur premier geste utilisateur (politique autoplay Chrome)
  const unlockAudio = () => {
    world?._audio?.unlock?.();
  };
  // pointerdown couvre souris + tactile. On garde les listeners:
  // si l'AudioContext repasse en "suspended" (onglet inactif), un nouveau geste le relance.
  document.addEventListener("pointerdown", unlockAudio, { passive: true });
  document.addEventListener("keydown", unlockAudio);

  game.setWorld(world);
  game.start();

  // Messages de bienvenue
  setTimeout(() => hud.toast("🎮 GTA II Web V2_0_0 — COMPLETE EDITION", 3.0), 500);
  setTimeout(() => hud.toast("📞 Réponds aux téléphones [T] pour démarrer des missions!", 3.0), 4000);
  setTimeout(() => hud.toast("🗺️ Minimap en bas à droite • [F] changer d'arme", 2.5), 7500);
}

boot().catch(e => {
  console.error("INIT ERROR:", e);
  document.body.innerHTML += `<div style="color:#ff4444;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#000;padding:24px;border:1px solid #ff4444;font-size:16px;font-family:monospace;z-index:9999;border-radius:8px;">
    <b>Erreur de démarrage</b><br><br>${e.message}<br><br>
    <small>Vérifiez que assets/maps/grenoble.json est accessible (serveur local requis).</small>
  </div>`;
});
