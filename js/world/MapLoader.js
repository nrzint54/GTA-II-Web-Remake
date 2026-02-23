import { Map } from "./Map.js";

/**
 * MapLoader
 *
 * Charge une map JSON via fetch() et la transforme en instance de Map.
 *
 * Format JSON attendu:
 * {
 *   id, width, height, tileSize,
 *   tiles: number[],
 *   solids: number[]
 * }
 */
export class MapLoader {
  /**
   * @param {string} url Chemin vers le JSON
   * @returns {Promise<Map>}
   */
  static async loadJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Map load failed: ${url}`);

    const data = await res.json();
    return new Map(data);
  }
}
