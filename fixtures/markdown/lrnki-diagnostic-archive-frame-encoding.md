# Archive Frame Encoding

The fictional Lattice Archive stores a text label and an opaque payload in each Archive Frame. The
format uses different counting rules for the label and payload. These fields are not interchangeable,
even when their numeric values happen to be equal.

## Payload Octet Count

The **Payload Octet Count** is the number of octets in the encoded payload exactly as stored in the
frame. An octet is an eight-bit unit. The count includes every payload octet and excludes the frame
header, label, and checksum.

Payload Octet Count does not count displayed characters. A UTF-8 text payload can use more than one
octet for a character, while a compressed or encrypted payload may not have a meaningful character
count at all. An empty payload has a Payload Octet Count of zero.

## Label Scalar Count

The **Label Scalar Count** is the number of Unicode scalar values in the normalized label. Before
counting, the writer normalizes the label to Unicode Normalization Form C. The count excludes the
terminating zero octet used by the binary frame.

Label Scalar Count is not a byte length and is not a count of user-perceived grapheme clusters. A
single displayed symbol can contain more than one Unicode scalar value, and one scalar value can use
multiple octets in UTF-8.

## Payload checksum

The **Payload Checksum** is calculated over the stored payload octets in order. It excludes the
header, normalized label, terminating zero octet, and the checksum field itself. Two frames with the
same Payload Octet Count can have different checksums because equal length does not imply equal
content.

The reader verifies the checksum before decoding or interpreting the payload. A checksum match shows
that the stored payload octets agree with the recorded checksum under this algorithm; it does not
prove that the payload is truthful, safe, or meaningful.

## Validation sequence

A reader validates an Archive Frame in this order:

1. Read the header and declared field lengths.
2. Confirm that the complete label, terminator, payload, and checksum are present.
3. Normalize the decoded label and compare its scalar count with Label Scalar Count.
4. Count the stored payload octets and compare the result with Payload Octet Count.
5. Calculate and compare the Payload Checksum.
6. Only after these checks, pass the payload to its format-specific decoder.

A truncated frame is invalid even when all bytes that are present have a valid prefix. A decoder must
not treat the declared Payload Octet Count as proof that those octets were actually received.

## Examples

The normalized label `Cafe` contains four Unicode scalar values and four UTF-8 octets. The normalized
label `Café` also contains four Unicode scalar values, but it uses five UTF-8 octets. Equal scalar
counts therefore do not imply equal byte lengths.

A three-octet opaque payload has Payload Octet Count 3 regardless of whether another program chooses
to display those octets as text. Its interpretation cannot change the count stored in the Archive
Frame.
