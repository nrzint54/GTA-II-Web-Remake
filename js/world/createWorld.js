import { Player } from "../entities/Player.js";
import { Ped } from "../entities/Ped.js";
import { Vehicle } from "../entities/Vehicle.js";
import { CopCar } from "../entities/CopCar.js";
import { CopPed } from "../entities/CopPed.js";
import { SpatialHash } from "../physics/SpatialHash.js";
import { PoliceManager } from "../police/PoliceManager.js";
import { buildRoadGraph } from "./RoadGraph.js";
import { Effects } from "../core/Effects.js";
import { isFixedLiveryVehicleId, pickRandomPaintId, pickRandomVehicleId } from "../entities/VehicleDefs.js";
import { ProjectileSystem } from "../gameplay/ProjectileSystem.js";
import { PickupSystem } from "../pickup/PickupSystem.js";
import { HazardSystem } from "../hazard/HazardSystem.js";
import { GangSystem } from "../gang/GangSystem.js";
import { GarageSystem } from "../garage/GarageSystem.js";
import { PhoneSystem } from "../missions/PhoneSystem.js";
import { ScriptEngine } from "../script/ScriptEngine.js";
import { buildMissionScripts } from "../script/MissionScripts.js";
import { AudioSystem } from "../audio/AudioSystem.js";
import { OverlaySystem } from "../ui/OverlaySystem.js";

export function createWorld({ map } = {}) {
  if (!map) throw new Error("createWorld: map manquante");

  map.roadGraph = buildRoadGraph(map, { roadTile: 2 });

  const spatial = new SpatialHash(map.tileSize * 2);
  const effects = new Effects();
  const police = new PoliceManager();
  const entities = [];

  // Systèmes V2
  const projectileSystem = new ProjectileSystem();
  const pickupSystem = new PickupSystem();
  pickupSystem.spawnRandom(map, 50);
  const hazardSystem = new HazardSystem();
  const gangSystem = new GangSystem();
  gangSystem.init(map);
  const garageSystem = new GarageSystem();
  garageSystem.init(map);
  const phoneSystem = new PhoneSystem();
  phoneSystem.init(map);
  const audio = new AudioSystem();
  const overlaySystem = new OverlaySystem();

  // ScriptEngine V2
  const scriptEngine = new ScriptEngine();
  scriptEngine.registerClasses({
    Ped, Vehicle,
    pickRandomVehicleId, isFixedLiveryVehicleId, pickRandomPaintId
  });
  // Chargement des missions scriptées
  const missionScripts = buildMissionScripts(map);
  for (const ms of missionScripts) scriptEngine.load(ms);

  // Helpers
  const ts = map.tileSize;
  const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  function isPassableTile(t) { return !map.isSolidTile(t); }

  function tryFindPassableWorldPos({ x0, y0, x1, y1, preferTileIds = null, attempts = 200 } = {}) {
    for (let k = 0; k < attempts; k++) {
      const tx = randInt(x0, x1); const ty = randInt(y0, y1);
      const t = map.tileAt(tx, ty);
      if (!isPassableTile(t)) continue;
      if (preferTileIds && !preferTileIds.includes(t)) continue;
      return { x: (tx+0.5)*ts, y: (ty+0.5)*ts };
    }
    for (let k = 0; k < attempts; k++) {
      const tx = randInt(x0, x1); const ty = randInt(y0, y1);
      if (!isPassableTile(map.tileAt(tx, ty))) continue;
      return { x: (tx+0.5)*ts, y: (ty+0.5)*ts };
    }
    return { x: (map.width*ts)/2, y: (map.height*ts)/2 };
  }

  function randomRoadWorldPos() {
    const rg = map.roadGraph;
    if (!rg?.dirEdges?.length) return tryFindPassableWorldPos({ x0:4,y0:4,x1:map.width-5,y1:map.height-5,preferTileIds:[2,3] });
    for (let k=0;k<80;k++) {
      const e=rg.dirEdges[randInt(0,rg.dirEdges.length-1)];
      if(!e?.tiles?.length) continue;
      const tt=e.tiles[randInt(0,e.tiles.length-1)];
      if(map.tileAt(tt.tx,tt.ty)!==2) continue;
      return{x:(tt.tx+0.5)*ts,y:(tt.ty+0.5)*ts};
    }
    return tryFindPassableWorldPos({x0:4,y0:4,x1:map.width-5,y1:map.height-5,preferTileIds:[2]});
  }

  function randomSidewalkWorldPos() {
    return tryFindPassableWorldPos({x0:4,y0:4,x1:map.width-5,y1:map.height-5,preferTileIds:[3,0]});
  }

  // Player
  const spawns = map.meta?.spawns ?? null;
  const playerPos = spawns?.player ?? randomSidewalkWorldPos();
  const player = new Player({ x: playerPos.x, y: playerPos.y });
  entities.push(player);

  // Spawns map
  if (spawns?.civPeds?.length) for (const p of spawns.civPeds) entities.push(new Ped({x:p.x,y:p.y}));
  if (spawns?.vehicles?.length) for (const v of spawns.vehicles) {
    const model=pickRandomVehicleId({group:v.group||"civil"});
    const paintId=isFixedLiveryVehicleId(model)?null:pickRandomPaintId();
    entities.push(new Vehicle({x:v.x,y:v.y,model,paintId}));
  }

  // Spawn par district
  const districts = Array.isArray(map.meta?.districts)?map.meta.districts:[];
  const rulesById = map.meta?.spawnRules?.districts??null;
  const clampi=(v,a,b)=>Math.max(a,Math.min(b,v|0));

  function districtBounds(d) {
    const b=d?.bounds??{};
    return{x0:clampi(b.x0??0,0,map.width-1),y0:clampi(b.y0??0,0,map.height-1),x1:clampi(b.x1??(map.width-1),0,map.width-1),y1:clampi(b.y1??(map.height-1),0,map.height-1)};
  }
  function pickWeightedKey(weights,fallback="civil"){
    if(!weights||typeof weights!=="object")return fallback;
    const entries=Object.entries(weights).filter(([,v])=>Number.isFinite(v)&&v>0);
    if(!entries.length)return fallback;
    let sum=0;for(const[,w]of entries)sum+=w;
    let r=Math.random()*sum;for(const[k,w]of entries){r-=w;if(r<=0)return k;}
    return entries[entries.length-1][0];
  }

  if(rulesById&&districts.length){
    for(const d of districts){
      const r=rulesById[d.id]??{};
      const b=districtBounds(d);
      const peds=clampi(r.peds??0,0,60);
      const tv=clampi(r.trafficVehicles??0,0,40);
      const pv=clampi(r.parkedVehicles??0,0,30);
      const groups=r.vehicleGroups??{civil:1};
      for(let i=0;i<tv;i++){const pos=tryFindPassableWorldPos({...b,preferTileIds:[2],attempts:220});const model=pickRandomVehicleId({group:pickWeightedKey(groups,"civil")});const paintId=isFixedLiveryVehicleId(model)?null:pickRandomPaintId();const veh=new Vehicle({x:pos.x,y:pos.y,model,paintId});veh.aiTraffic=true;entities.push(veh);}
      for(let i=0;i<pv;i++){const pos=tryFindPassableWorldPos({...b,preferTileIds:[3,0],attempts:220});const model=pickRandomVehicleId({group:pickWeightedKey(groups,"civil")});const paintId=isFixedLiveryVehicleId(model)?null:pickRandomPaintId();entities.push(new Vehicle({x:pos.x,y:pos.y,model,paintId}));}
      for(let i=0;i<peds;i++){const pos=tryFindPassableWorldPos({...b,preferTileIds:[3,0],attempts:200});entities.push(new Ped({x:pos.x,y:pos.y}));}
    }
  } else {
    for(let i=0;i<12;i++){const pos=randomRoadWorldPos();const model=pickRandomVehicleId({group:"civil"});const paintId=isFixedLiveryVehicleId(model)?null:pickRandomPaintId();const veh=new Vehicle({x:pos.x,y:pos.y,model,paintId});veh.aiTraffic=true;entities.push(veh);}
    for(let i=0;i<20;i++){const pos=randomSidewalkWorldPos();entities.push(new Ped({x:pos.x,y:pos.y}));}
  }

  // Peds de gang (colorés par gang)
  for (const gang of gangSystem.gangs) {
    for (let i = 0; i < 4; i++) {
      const b = gang.bounds;
      if (!b) continue;
      const gx0 = Math.max(0, Math.floor(b.x0/ts));
      const gy0 = Math.max(0, Math.floor(b.y0/ts));
      const gx1 = Math.min(map.width-1, Math.floor(b.x1/ts));
      const gy1 = Math.min(map.height-1, Math.floor(b.y1/ts));
      const pos = tryFindPassableWorldPos({ x0:gx0, y0:gy0, x1:gx1, y1:gy1, preferTileIds:[3,0,2], attempts:100 });
      const ped = new Ped({ x: pos.x, y: pos.y });
      ped.gangId = gang.id;
      ped.color = gang.color;
      entities.push(ped);
    }
  }

  // Cop starter
  entities.push(new CopPed({ x: player.x+70, y: player.y+40 }));

  // Spatial index
  for (const e of entities) spatial.insert(e);

  const world = {
    map, spatial, effects, police, player, entities, missions: null,
    projectileSystem, pickupSystem, hazardSystem,
    gangSystem, garageSystem, phoneSystem,
    scriptEngine, _audio: audio, _overlay: overlaySystem
  };

  // Bind ScriptEngine au monde
  setTimeout(() => {}, 0); // bind se fait dans main.js après setWorld()

  return world;
}
