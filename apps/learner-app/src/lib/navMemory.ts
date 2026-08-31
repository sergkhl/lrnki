import AsyncStorage from "@react-native-async-storage/async-storage";
import { createNavigationMemory } from "./navigationMemory";

const navigationMemory = createNavigationMemory({
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value)
});

export const readBoardSeen = navigationMemory.readBoardSeen;
export const writeBoardSeen = navigationMemory.writeBoardSeen;
