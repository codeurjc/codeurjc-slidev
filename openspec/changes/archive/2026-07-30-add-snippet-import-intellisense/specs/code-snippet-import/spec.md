## ADDED Requirements

### Requirement: A selector can be written back into an existing import line
The module SHALL expose a serializer that, given a `<<<` import line's raw text and a new selector's raw bracket content, splices that selector into the line's `[selector]` position — replacing an existing selector if present, or inserting one if absent — leaving the file path, language, and any trailing keywords (e.g. `notitle`) unchanged. This is the write-back counterpart to `parseSnippetImportLine`, for editor tooling that computes a selector and needs to write it back without re-deriving the line's bracket-splicing position.

#### Scenario: Inserting a selector into an import with none
- **WHEN** serializing `<<< @/code/Foo.java java` with new selector raw content `7-24`
- **THEN** the result is `<<< @/code/Foo.java[7-24] java`

#### Scenario: Replacing an existing selector
- **WHEN** serializing `<<< @/code/Foo.java[1-5] java` with new selector raw content `"a".."b"`
- **THEN** the result is `<<< @/code/Foo.java["a".."b"] java`

#### Scenario: Trailing keywords are preserved
- **WHEN** serializing `<<< @/code/Foo.java[1-5] java notitle` with new selector raw content `7-24`
- **THEN** the result is `<<< @/code/Foo.java[7-24] java notitle`
