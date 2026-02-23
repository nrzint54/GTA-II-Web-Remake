/**
 * HUD (V1_2_0)
 *
 * Nouvelles données affichées:
 * - Armure (armor)
 * - Réputation gang (gangRep)
 */
export class HUD {
  constructor() {
    this.$health = document.getElementById("hudHealth");
    this.$armor = document.getElementById("hudArmor");
    this.$money = document.getElementById("hudMoney");
    this.$weapon = document.getElementById("hudWeapon");
    this.$wanted = document.getElementById("hudWanted");
    this.$mission = document.getElementById("hudMission");
    this.$missionStatus = document.getElementById("hudMissionStatus");
    this.$gangRep = document.getElementById("hudGangRep");
    this.$toast = document.getElementById("toast");
    this._toastTime = 0;
  }

  set({ health, armor, money, weapon, wanted, mission, missionStatus, gangRep }) {
    if (this.$health) this.$health.textContent = String(health);
    if (this.$armor) this.$armor.textContent = armor > 0 ? `🛡️${String(armor)}` : "";
    if (this.$money) this.$money.textContent = String(money);
    if (this.$weapon) this.$weapon.textContent = String(weapon);
    if (this.$wanted) this.$wanted.textContent = String(wanted);
    if (this.$mission) this.$mission.textContent = String(mission);
    if (this.$missionStatus) this.$missionStatus.textContent = String(missionStatus ?? "—");
    if (this.$gangRep) this.$gangRep.textContent = String(gangRep ?? "");
  }

  update(dt) {
    if (this._toastTime > 0) {
      this._toastTime -= dt;
      if (this._toastTime <= 0) {
        this._toastTime = 0;
        if (this.$toast) { this.$toast.classList.remove("show"); this.$toast.textContent = ""; }
      }
    }
  }

  toast(message, seconds = 1.6) {
    if (!this.$toast) return;
    this.$toast.textContent = message;
    this.$toast.classList.add("show");
    this._toastTime = seconds;
  }
}
