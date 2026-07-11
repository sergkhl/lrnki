import { View } from "react-native";
import { LogOut, Menu as MenuIcon, Swords, Trophy } from "lucide-react-native";
import { BottomSheet, OverlayHeader, PressableSurface, Text, colors } from "@/ui";
import { learnerTerm } from "@/learn/vocabulary";

// The journal-only menu (R11): Duel, Board, and logout as full-width action rows in a
// bottom sheet. Every action first closes the sheet, so the journal never stacks a
// sheet under a dialog; the parent owns the handoff.
export function LearnerMenuSheet({
  open,
  onOpenChange,
  boardAvailable,
  onOpenBoard,
  onEnterDuel,
  onLogout
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardAvailable: boolean;
  onOpenBoard: () => void;
  onEnterDuel: () => void;
  onLogout: () => void;
}>) {
  const handoff = (action: () => void) => {
    onOpenChange(false);
    action();
  };
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <OverlayHeader
        icon={<MenuIcon size={20} color={colors.ink} />}
        title="Menu"
        onClose={() => onOpenChange(false)}
      />
      <View className="gap-1 p-4 pt-2">
        <MenuRow
          icon={<Swords size={18} color={colors.ink} />}
          label={learnerTerm("duelEntry")}
          onPress={() => handoff(onEnterDuel)}
        />
        <MenuRow
          icon={<Trophy size={18} color={colors.ink} />}
          label={learnerTerm("viewBoard")}
          disabled={!boardAvailable}
          onPress={() => handoff(onOpenBoard)}
        />
        <MenuRow
          icon={<LogOut size={18} color={colors.ink} />}
          label={learnerTerm("logoutAction")}
          onPress={() => handoff(onLogout)}
        />
      </View>
    </BottomSheet>
  );
}

function MenuRow({
  icon,
  label,
  onPress,
  disabled = false
}: Readonly<{ icon: React.ReactNode; label: string; onPress: () => void; disabled?: boolean }>) {
  return (
    <PressableSurface
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-control w-full flex-row items-center gap-3 rounded-control px-3 ${disabled ? "opacity-50" : ""}`}
      pressedClassName="bg-muted-panel"
    >
      {icon}
      <Text variant="label">{label}</Text>
    </PressableSurface>
  );
}
