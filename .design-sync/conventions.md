## Building with the lrnki learner design system

These are the learner-facing components of an **Expo / React Native app**, compiled for the
web through react-native-web. Four things follow from that and change what you write.

### 1. Wrap every design in `DesignSystemProvider`

```jsx
<DesignSystemProvider>
  <Screen>…your design…</Screen>
</DesignSystemProvider>
```

It supplies safe-area insets, the query client, and the portal host that every `Dialog`,
`BottomSheet`, `SideSheet` and `FullScreenDialog` mounts into. Without it, `Screen` and
`RouteStatus` throw and overlays render nothing.

### 2. Layout is flex COLUMN by default

Every component here is a React Native view: it is already `display:flex; flex-direction:column`.
Do not add a `flex-col` class — it does not exist in this system. Add `flex-row` when you want
a row. There is no `View` export by design (the app's own lint rules forbid raw RN views outside
its UI boundary): compose with `Card`, `Screen`, and the overlay parts, and use a plain element
with these utility classes for pure layout glue.

### 3. Styling is NativeWind `className` over a CLOSED token palette

Components take `className` (NativeWind v5 → Tailwind v4). Arbitrary values and off-palette
colours will not render — only these token names exist. Use them as `bg-*`, `text-*`, `border-*`:

| family | tokens |
|---|---|
| ground & surface | `background`, `card`, `muted-panel`, `line`, `line-strong` |
| type | `ink`, `muted`, `on-accent` |
| trail | `trail`, `trail-muted`, `frontier`, `fog` |
| gem / accent | `gem`, `gem-soft` |
| map | `map-parchment`, `map-parchment-deep`, `map-ink`, `map-ink-soft` |
| formation | `cavern`, `cavern-panel`, `cavern-rock`, `cavern-edge`, `cavern-ink` |
| earned | `gold`, `gold-ink`, `award`, `secured` |
| status | `destructive`, `scrim` |

Radii are semantic, not numeric: `rounded-card` (flat, 8px — cards never elevate),
`rounded-control` (12px), `rounded-overlay` (16px). Touch sizes: `h-target` / `w-target` (44px
minimum) and `h-control` (48px). Layout/spacing utilities behave as in Tailwind (`gap-3`, `p-4`,
`px-4`, `py-3`, `items-center`, `justify-between`, `flex-1`, `shrink-0`, `min-w-0`, `w-full`).

The palette is warm parchment and ink, not a neutral grey UI. Gold is **earned-only** — never
use it as decoration.

### 4. Text and labels are props, not children

`Text` is the only text primitive; a bare string cannot be a child of a layout element. Set the
type scale with `variant` (`display`, `heading`, `title`, `map-title`, `label`, `body`,
`caption`) and colour with `color` — do not reach for font-size classes. `map-title` is the
IM Fell English display face, used only on map surfaces, and it ships one regular cut, so never
bold it. `Button` and `IconButton` take a `label` / `accessibilityLabel` string rather than
children, and `Input` requires a `label`.

### Where the truth lives

Read `_ds/<folder>/styles.css` and its imports for the compiled tokens and utilities, and
`components/<group>/<Name>/<Name>.prompt.md` plus `<Name>.d.ts` for any component before using
it — the props carry the real constraints, including which states are meaningful.

### An idiomatic screen

```jsx
<DesignSystemProvider>
  <Screen>
    <QuestHeader session={session} trail={trail} expeditionTitle="Why some eruptions are explosive"
      onJumpToSection={jump} onOpenVista={openVista} />
    <div className="gap-3 p-4">
      <Card className="gap-2 p-4">
        <div className="flex-row items-center justify-between gap-2">
          <Text variant="title">Leg 2 · Magma and melt</Text>
          <Badge>2 of 4</Badge>
        </div>
        <Progress fraction={0.5} accessibilityLabel="Leg 2 progress" />
        <Text variant="caption">Two checkpoints remain before the Guardian.</Text>
      </Card>
      <Button label="Continue expedition" onPress={resume} />
    </div>
  </Screen>
</DesignSystemProvider>
```
