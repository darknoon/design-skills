
Usually the first process that you'll do when designing an icon is to think about visual metaphors you could use and how that might apply, referencing [[icon-design-principles]].

## 1. Create N initial concepts using words

Imagine the general layout of the icon that you're going to create. For example, you're imagining that there's a person that takes up most of the frame represented by a profile of a head and shoulders. So it will be slightly offset to the left to accommodate a badge that will go to the right. So your overall layout could be be:

Concept 1:

We have the man on the left half of the icon area, he's rendered in a blobby style with his head
The dog is visible in the bottom right half of the icon area, it's a pomeranian with fluffy fur.

Concept 2:
We have just the foot and lower leg of the man visible at the far left edge, cropped by the frame. The dog — a small terrier — dominates the right three-quarters of the icon, shown in profile facing right towards the travel direction. The leash runs diagonally from off-canvas left down to the dog's collar at center-right. 
The composition creates a sense of scale and closeness — the dog feels large and present.

Concept 3:
Overhead/top-down view looking down at a sidewalk. On the left we see a pair of shoes (two simple rounded rectangles, toes pointing right). On the right we see four small paw prints arranged in a walking pattern. A curved leash arc connects them across the middle of the frame. The concept is minimal and geometric — no bodies, just the ground-level evidence of the walk.

## 1.a Generate sketches based on conceptual ideas

We'll take each concept and feed it into a text-to-image generator in a batch. see: [[image-gen.md]]

## 2. Present icons to user to evaluate

Start a web server locally and present the icons into a grid:

bash
python skills/create-svg-icon/scripts/preview-icons.py examples/


See `scripts/preview-icons.py`.
