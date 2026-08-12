import { Input } from "@lrnki/learner-app";

const col: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 16, width: 340 };

/** The label is required — it is the field's accessible name, not decoration.
 * `hint` explains the field; it stays visible while the field is valid. */
export function Labelled() {
  return (
    <div style={col}>
      <Input label="Explorer name" placeholder="Choose freely" onChangeText={() => {}} />
      <Input
        label="Explorer name"
        hint="The name fellow explorers see on the weekly board."
        value="Ada of the Frontier"
        onChangeText={() => {}}
      />
    </div>
  );
}

/** `error` swaps the border to the destructive token and renders the message below.
 * Passing an error does not clear the value — the learner keeps what they typed. */
export function WithError() {
  return (
    <div style={col}>
      <Input
        label="Email"
        value="ada@"
        error="That does not look like an email address."
        keyboardType="email-address"
        autoCapitalize="none"
        onChangeText={() => {}}
      />
    </div>
  );
}

/** Ordinary React Native TextInput props are forwarded unchanged. */
export function Kinds() {
  return (
    <div style={col}>
      <Input
        label="Password"
        hint="At least 8 characters."
        secureTextEntry
        value="correct-horse"
        onChangeText={() => {}}
      />
      <Input label="Field notes" multiline value={"What I noticed:\nthe melt drained quietly."} onChangeText={() => {}} />
      <Input label="Sealed leg" value="Magma and melt" editable={false} onChangeText={() => {}} />
    </div>
  );
}
