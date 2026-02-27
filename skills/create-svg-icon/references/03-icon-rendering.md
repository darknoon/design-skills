
## Rendering

The process of rendering is taking these initial sketches and focusing carefully on the details of each icon design to refine it to be adapted for the target usage. That would mean it looks good at a small size, the elements are proportional to the overall design, and it looks good alongside other icons of the set.

Referring back our [[icon-design-principles]], it's critical to use this stage to optimize visual clarity by exploring alternative solutions to issues.

### Outlined appearance via fill paths

Some icon sets (e.g. Codicons, SF Symbols) look outlined but don't use SVG `stroke` at all. Instead, the outlined shapes are constructed as filled `<path>` elements with cutouts — the "stroke" is a gap between an outer and inner contour baked into the path geometry.

This matters during rendering because:

- **Visual weight is baked into the path data** — you can't adjust it with `stroke-width`. Perceptual stroke width varies by set and viewBox (e.g. Codicons targets ~1px in a 16x16 grid).
- **Hand-drawn SVG must use filled regions**, not `<line>`, `<polyline>`, or `stroke-width`. Build outlines as two concentric shapes with fill-rule or path winding to cut out the interior.
- **t2i + vectorize pipeline**: Generate the concept image at the target set's visual weight, then vectorize. The vectorizer (Quiver) typically produces fill-based output already, which is what you want. If it instead produces stroke-based paths, convert them to outlined fills by hand.

### Example workflow

*Prelude:*
The user has requested an icon involving a man walking the dog and I've already prepared some initial sketches of the idea with different layouts (in this case using a text-to-image model) as .png files.

The user has selected option 3 of 5 as a good concept + sketch to persue, but has requested to fix some visual details about how the dog's ear look.

*Work:*

I take option-dog-poodle.png and run it through