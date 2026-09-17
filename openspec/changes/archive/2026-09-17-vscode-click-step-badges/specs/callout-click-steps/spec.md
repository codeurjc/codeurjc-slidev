## ADDED Requirements

### Requirement: Native fence line ranges keep working on fences the theme wraps
A fenced code block that the theme wraps itself, because it carries code-highlight markers or an inline `// [!source ...]` link, SHALL keep Slidev's native line-highlighting ranges (`{a|b|c}`) and fence options (`{at: …, lines: …, startLine: …, maxHeight: …, finally: …}`) exactly as Slidev's own code block wrapper applies them. Those ranges SHALL highlight their lines and register their clicks, alongside the markers' own click steps.

#### Scenario: Markers and native ranges on one fence
- **WHEN** a fence is written as ```` ```ts {1|3} ```` and one of its lines carries `// [!mark{2}] note`
- **THEN** line 1 is highlighted initially, line 3 at click 1, the marker's callout appears at click 2, and the slide has 2 clicks

#### Scenario: Fence options on a marked fence
- **WHEN** a fence with a marker is written as ```` ```ts {1|2} {at: 3} ````
- **THEN** its second range is highlighted from click 3
