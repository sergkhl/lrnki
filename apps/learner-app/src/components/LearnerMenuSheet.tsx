import { View } from "react-native";
import { LogOut, Menu as MenuIcon, Trophy } from "lucide-react-native";
import { OverlayHeader, PressableSurface, SideSheet, Text, colors } from "@/ui";
import { learnerTerm } from "@/learn/vocabulary";

// The journal-only menu (R11): Board and logout as full-width action rows in a
// right-anchored drawer (it opens from the edge its top-right trigger lives on). Every
// action first closes the drawer, so the journal never stacks a sheet under a dialog;
// the parent owns the handoff.
export function LearnerMenuSheet({
  open,
  onOpenChange,
  boardAvailable,
  onOpenBoard,
  onLogout
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardAvailable: boolean;
  onOpenBoard: () => void;
  onLogout: () => void;
}>) {
  // Sequenced handoff (plan 2026-07-16-003 D7): yield a frame between closing the sheet
  // and invoking the action, so a Dialog's entering animation never mounts during this
  // portal's teardown — the Android race that left the Board blank via the menu path.
  const handoff = async (action: () => void) => {
    onOpenChange(false);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    action();
  };
  return (
    <SideSheet open={open} onOpenChange={onOpenChange}>
      <OverlayHeader
        icon={<MenuIcon size={20} color={colors.ink} />}
        title="Menu"
        onClose={() => onOpenChange(false)}
      />
      <View className="gap-1 p-4 pt-2">
        <MenuRow
          icon={<Trophy size={18} color={colors.ink} />}
          label={learnerTerm("viewBoard")}
          disabled={!boardAvailable}
          onPress={() => void handoff(onOpenBoard)}
        />
        <MenuRow
          icon={<LogOut size={18} color={colors.ink} />}
          label={learnerTerm("logoutAction")}
          onPress={() => void handoff(onLogout)}
        />
      </View>
    </SideSheet>
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
