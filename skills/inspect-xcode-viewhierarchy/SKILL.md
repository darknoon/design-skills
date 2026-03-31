---
name: inspect-xcode-viewhierarchy
description: Inspect exported Xcode `.viewhierarchy` bundles to diagnose iOS view layout issues. Use when the user has exported "View Hierarchy for <App>.viewhierarchy" from Xcode and wants concrete frame, subtree, or constraint evidence instead of visual guesswork.
argument-hint: "[path to .viewhierarchy bundle or issue description]"
allowed-tools: Read, Write, Glob, Bash(jq *), Bash(gzip *), Bash(plutil *), Bash(find *), Bash(ls *)
---

# Inspect Xcode View Hierarchy

Use this skill when the user has an exported Xcode view debugger bundle such as `View Hierarchy for MyApp.viewhierarchy`.

Goal: extract concrete evidence from the bundle before proposing UI fixes.

## What the bundle contains

For current Xcode exports, expect:

- `metadata` as plist/XML
- `RequestResponses/Response_*` as gzip files
- `Response_0` commonly decompresses to JSON containing:
  - `topLevelGroups`
  - `topLevelPropertyDescriptions`

Do not assume the format is opaque until you inspect it.

## Workflow

1. Find the bundle and inspect its contents.

```bash
find . -maxdepth 4 -name '*.viewhierarchy' | sort
find 'View Hierarchy for MyApp.viewhierarchy' -maxdepth 3 -type f | sort
file 'View Hierarchy for MyApp.viewhierarchy/RequestResponses/'*
```

2. Read `metadata` and extract `Response_0`.

```bash
sed -n '1,200p' 'View Hierarchy for MyApp.viewhierarchy/metadata'
gzip -dc 'View Hierarchy for MyApp.viewhierarchy/RequestResponses/Response_0' > /tmp/viewhierarchy_response0.json
jq 'keys' /tmp/viewhierarchy_response0.json
```

3. Search the full JSON for the relevant classes first.

```bash
jq '.. | objects | select((.className? // "") | test("MyView|UIVisualEffectView|UIHosting")) | {objectID, className}' /tmp/viewhierarchy_response0.json
```

4. Once you have an `objectID`, inspect just that node.

```bash
jq '
  .. | objects
  | select(.objectID? == "0xDEADBEEF")
  | {
      objectID,
      className,
      frame: ([.properties[]? | select(.propertyName=="frame") | .propertyValue][0]),
      bounds: ([.properties[]? | select(.propertyName=="bounds") | .propertyValue][0]),
      layoutMargins: ([.properties[]? | select(.propertyName=="layoutMargins") | .propertyValue][0]),
      hidden: ([.properties[]? | select(.propertyName=="hidden") | .propertyValue][0]),
      alpha: ([.properties[]? | select(.propertyName=="alpha") | .propertyValue][0])
    }
' /tmp/viewhierarchy_response0.json
```

5. If the problem is likely inside a subtree, recursively flatten descendants.

```bash
jq '
  def flat($n):
    [$n | {
      objectID,
      className,
      frame: ([.properties[]? | select(.propertyName=="frame") | .propertyValue][0]),
      bounds: ([.properties[]? | select(.propertyName=="bounds") | .propertyValue][0]),
      layoutMargins: ([.properties[]? | select(.propertyName=="layoutMargins") | .propertyValue][0])
    }]
    + [($n.childGroup.debugHierarchyObjects[]? | flat(.))[]];

  .. | objects
  | select(.objectID? == "0xDEADBEEF")
  | flat(.)
' /tmp/viewhierarchy_response0.json
```

6. Report the first layer where geometry becomes wrong.

Do not stop at "the screenshot looks off." Identify:

- the last ancestor with expected frame/alignment
- the first descendant with the bad offset/inset/size
- the likely mechanism: negative frame origin, extra layout margin, oversized scroll host, zero-sized content view, etc.

## Heuristics

- If outer UIKit wrapper views look correct but a SwiftUI descendant has a negative `y` or oversized height, the bug is likely in SwiftUI’s internal container layout, not the accessory host.
- Horizontal `ScrollView` in SwiftUI can introduce internal hosting/container layers that are offset relative to the parent hosting view. Check those before patching symbol offsets or outer constraints.
- `UIVisualEffectView` and `_UIVisualEffectContentView` frequently look suspicious but are often fine; verify the hosted content frame before changing glass/inset constants.
- Ignore null/no-op class entries from recursive searches. Focus on objects that have real `objectID` values and frame/bounds properties.

## Good output

Summaries should be concrete:

- `FormattingToolbarAccessory` frame is `402x62`
- `UIVisualEffectView` is inset to `378x50` at `y=6`
- hosted SwiftUI view is centered at `378x38`
- the first wrong frame is the SwiftUI scroll platform container at `y=-11`, height `49`

That level of specificity is the point of this skill.
