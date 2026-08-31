import { createNavigationMemory } from "./navigationMemory";

const navigationMemory = createNavigationMemory({
  async getItem(key) { return window.localStorage.getItem(key); },
  async setItem(key, value) { window.localStorage.setItem(key, value); }
});

export const readBoardSeen = navigationMemory.readBoardSeen;
export const writeBoardSeen = navigationMemory.writeBoardSeen;
