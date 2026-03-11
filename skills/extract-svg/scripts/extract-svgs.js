// extract-svgs.js
// Discovers and extracts all SVGs from the current page.
// Derived from svg-gobbler (https://github.com/rossmoody/svg-gobbler)
//
// Usage with agent-browser:
//   agent-browser open <url>
//   agent-browser eval --stdin < extract-svgs.js
//
// Returns JSON with all discovered SVGs and page metadata.
// Inline SVGs have class-dependent styles resolved and inlined so each
// SVG is fully self-contained and renderable without external CSS.
// Image-ref SVGs are fetched in-page to resolve their actual content.

(async () => {
  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const isSvgRelated = (s) => {
    if (!s) return false;
    return (
      s.includes('.svg') ||
      s.includes('data:image/svg+xml') ||
      s.includes('image/svg+xml') ||
      (s.includes('data:') && s.includes('<svg')) ||
      s.includes('http://www.w3.org/2000/svg') ||
      /<(?:svg|path|circle|rect|g)\s/i.test(s) ||
      /viewBox\s*=\s*["']/i.test(s)
    );
  };

  const createImageTag = (source) => {
    const img = new Image();
    img.src = source;
    return img.outerHTML;
  };

  const bestName = (svg, index) => {
    const srcMatch = svg.match(/src=["']([^"']+)["']/);
    if (srcMatch) {
      const url = srcMatch[1];
      const fileMatch = url.match(/([^/]+)\.svg/i);
      if (fileMatch) return fileMatch[1];
    }
    const idMatch = svg.match(/\bid=["']([^"']+)["']/);
    if (idMatch) return idMatch[1];
    const titleMatch = svg.match(/<title>([^<]+)<\/title>/);
    if (titleMatch) return titleMatch[1];
    return `svg-${index + 1}`;
  };

  const classify = (svg) => {
    if (svg.startsWith('<svg')) return 'inline';
    if (svg.startsWith('<symbol')) return 'symbol';
    if (svg.startsWith('<g')) return 'g-element';
    if (svg.startsWith('<img')) return 'image-ref';
    return 'unknown';
  };

  const extractUrl = (bgValue) => {
    const match = bgValue.match(/url\(['"]?([^'"()]+)['"]?\)/);
    return match ? match[1] : null;
  };

  // ---------------------------------------------------------------------------
  // CSS inlining: resolve computed styles for classed elements inside an SVG
  // so the extracted SVG is self-contained.
  // ---------------------------------------------------------------------------

  // SVG presentation properties that can be set via CSS and should be inlined.
  const SVG_STYLE_PROPS = [
    'fill', 'fill-opacity', 'fill-rule',
    'stroke', 'stroke-dasharray', 'stroke-dashoffset',
    'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit',
    'stroke-opacity', 'stroke-width',
    'opacity', 'color', 'display', 'visibility',
    'clip-path', 'clip-rule', 'mask',
    'font-family', 'font-size', 'font-style', 'font-weight',
    'text-anchor', 'text-decoration',
  ];

  const inlineStylesOnSvg = (svgEl) => {
    // Clone so we don't mutate the live DOM
    const clone = svgEl.cloneNode(true);

    // Ensure xmlns for standalone rendering
    if (!clone.getAttribute('xmlns')) {
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }

    // Find all elements with a class attribute inside the SVG
    const classed = clone.querySelectorAll('[class]');
    if (classed.length === 0) return clone.outerHTML;

    // For each classed element, find the corresponding live element,
    // read its computed style, and inline the SVG presentation props.
    const liveClassed = svgEl.querySelectorAll('[class]');

    classed.forEach((cloneEl, i) => {
      const liveEl = liveClassed[i];
      if (!liveEl) return;

      const computed = getComputedStyle(liveEl);
      const parentComputed = liveEl.parentElement
        ? getComputedStyle(liveEl.parentElement)
        : null;

      const inlined = [];
      for (const prop of SVG_STYLE_PROPS) {
        const val = computed.getPropertyValue(prop);
        if (!val || val === '') continue;
        // Skip if same as parent (inherited, not class-specific)
        if (parentComputed && parentComputed.getPropertyValue(prop) === val) continue;
        inlined.push(`${prop}:${val}`);
      }

      if (inlined.length > 0) {
        const existing = cloneEl.getAttribute('style') || '';
        cloneEl.setAttribute('style', (existing ? existing + ';' : '') + inlined.join(';'));
      }
      cloneEl.removeAttribute('class');
    });

    return clone.outerHTML;
  };

  // ---------------------------------------------------------------------------
  // Strategy 1: <img>, <object>, <embed>, <iframe>, CSS background-image
  // ---------------------------------------------------------------------------

  const parseSourceAndBgImages = () => {
    const results = [];

    document.querySelectorAll('img[src*=".svg"], img[src*="data:image/svg+xml"]').forEach((el) => {
      if (el instanceof HTMLImageElement && isSvgRelated(el.src))
        results.push(createImageTag(el.src));
    });

    document.querySelectorAll('object[type="image/svg+xml"]').forEach((el) => {
      if (el instanceof HTMLObjectElement) results.push(createImageTag(el.data));
    });

    document.querySelectorAll('embed[type="image/svg+xml"], embed[src*=".svg"]').forEach((el) => {
      if (el instanceof HTMLEmbedElement) results.push(createImageTag(el.src));
    });

    document.querySelectorAll('iframe[src*=".svg"]').forEach((el) => {
      if (el instanceof HTMLIFrameElement) results.push(createImageTag(el.src));
    });

    document.querySelectorAll('*').forEach((el) => {
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && isSvgRelated(bg)) {
        const url = extractUrl(bg);
        if (url) results.push(createImageTag(url));
      }
    });

    return results.filter(Boolean);
  };

  // ---------------------------------------------------------------------------
  // Strategy 2: Inline <svg> (excluding sprite containers)
  // With CSS inlined for self-contained output.
  // ---------------------------------------------------------------------------

  const gatherInlineSvgs = () =>
    [...document.querySelectorAll('svg')]
      .filter((svg) => !svg.querySelector('use, symbol'))
      .map((svg) => inlineStylesOnSvg(svg))
      .filter(Boolean);

  // ---------------------------------------------------------------------------
  // Strategy 3: <g> groups
  // ---------------------------------------------------------------------------

  const gatherGElements = () =>
    [...document.querySelectorAll('g')].map((g) => g.outerHTML).filter(Boolean);

  // ---------------------------------------------------------------------------
  // Strategy 4: <symbol> elements
  // ---------------------------------------------------------------------------

  const gatherSymbols = () =>
    [...document.querySelectorAll('symbol')].map((s) => s.outerHTML).filter(Boolean);

  // ---------------------------------------------------------------------------
  // Strategy 5: <use> references
  // ---------------------------------------------------------------------------

  const gatherUseElements = () => {
    const results = [];
    document.querySelectorAll('use').forEach((el) => {
      const href = el.getAttribute('href');
      if (href && isSvgRelated(href)) results.push(createImageTag(href));
      const xlink = el.getAttribute('xlink:href');
      if (xlink && isSvgRelated(xlink)) results.push(createImageTag(xlink));
    });
    return results.filter(Boolean);
  };

  // ---------------------------------------------------------------------------
  // Strategy 6: Shadow DOM (recursive)
  // ---------------------------------------------------------------------------

  const gatherShadowDomSvgs = () => {
    const results = [];
    const walk = (el) => {
      const shadow = el.shadowRoot;
      if (!shadow) return;
      shadow.querySelectorAll('svg').forEach((svg) => results.push(svg.outerHTML));
      shadow.querySelectorAll('img[src*=".svg"], object[type="image/svg+xml"]').forEach((child) => {
        if (child instanceof HTMLImageElement) results.push(createImageTag(child.src));
        else if (child instanceof HTMLObjectElement) results.push(createImageTag(child.data));
      });
      shadow.querySelectorAll('*').forEach((child) => walk(child));
    };
    document.querySelectorAll('*').forEach((el) => walk(el));
    return results.filter(Boolean);
  };

  // ---------------------------------------------------------------------------
  // Strategy 7: CSS custom properties (--var) containing SVG URLs
  // ---------------------------------------------------------------------------

  const gatherCssVarSvgs = () => {
    const results = [];
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules || []) {
          if (rule instanceof CSSStyleRule) {
            for (let i = 0; i < rule.style.length; i++) {
              const prop = rule.style[i];
              if (prop.startsWith('--')) {
                const val = rule.style.getPropertyValue(prop);
                if (isSvgRelated(val)) {
                  const url = extractUrl(val);
                  if (url) results.push(createImageTag(url));
                }
              }
            }
          }
        }
      } catch (_) {
        /* cross-origin stylesheet */
      }
    }
    return results.filter(Boolean);
  };

  // ---------------------------------------------------------------------------
  // Strategy 8: SVGs slotted into web components
  // ---------------------------------------------------------------------------

  const gatherWebComponentSvgs = () => {
    const results = [];
    [...document.querySelectorAll('*')]
      .filter((el) => el.tagName.includes('-'))
      .forEach((el) => {
        el.querySelectorAll('slot').forEach((slot) => {
          slot.assignedNodes().forEach((node) => {
            if (node instanceof SVGElement) results.push(node.outerHTML);
          });
        });
      });
    return results.filter(Boolean);
  };

  // ---------------------------------------------------------------------------
  // Strategy 9: CSS content property
  // ---------------------------------------------------------------------------

  const gatherCssContentSvgs = () => {
    const results = [];
    document.querySelectorAll('*').forEach((el) => {
      const content = getComputedStyle(el).getPropertyValue('content');
      if (content && isSvgRelated(content) && content.includes('url(')) {
        const url = extractUrl(content);
        if (url) results.push(createImageTag(url));
      }
    });
    return results.filter(Boolean);
  };

  // ---------------------------------------------------------------------------
  // Strategy 10: <template> elements
  // ---------------------------------------------------------------------------

  const gatherTemplateSvgs = () => {
    const results = [];
    document.querySelectorAll('template').forEach((tmpl) => {
      tmpl.content.querySelectorAll('svg').forEach((svg) => results.push(svg.outerHTML));
      tmpl.content
        .querySelectorAll('img[src*=".svg"], object[type="image/svg+xml"]')
        .forEach((el) => {
          if (el instanceof HTMLImageElement) results.push(createImageTag(el.src));
          else if (el instanceof HTMLObjectElement) results.push(createImageTag(el.data));
        });
    });
    return results.filter(Boolean);
  };

  // ---------------------------------------------------------------------------
  // Strategy 11: CSS sprite sheets (.icon / .sprite classes)
  // ---------------------------------------------------------------------------

  const gatherSpriteSvgs = () => {
    const results = [];
    document.querySelectorAll('[class*="icon"], [class*="sprite"]').forEach((el) => {
      const style = getComputedStyle(el);
      if (style.backgroundImage && style.backgroundPosition && isSvgRelated(style.backgroundImage)) {
        const url = extractUrl(style.backgroundImage);
        if (url) results.push(createImageTag(url));
      }
    });
    return results.filter(Boolean);
  };

  // ---------------------------------------------------------------------------
  // Strategy 12: <picture> with SVG sources
  // ---------------------------------------------------------------------------

  const gatherPictureSvgs = () => {
    const results = [];
    document.querySelectorAll('picture').forEach((pic) => {
      pic.querySelectorAll('source[type="image/svg+xml"]').forEach((src) => {
        const srcset = src.getAttribute('srcset');
        if (srcset) {
          srcset.split(',').forEach((s) => {
            const url = s.trim().split(' ')[0];
            results.push(createImageTag(url));
          });
        }
      });
      const img = pic.querySelector('img');
      if (img && isSvgRelated(img.src)) results.push(createImageTag(img.src));
    });
    return results.filter(Boolean);
  };

  // ---------------------------------------------------------------------------
  // Resolve image-ref URLs to actual SVG content
  // ---------------------------------------------------------------------------

  const resolveUrl = (src) => {
    if (src.startsWith('data:')) return src;
    if (src.startsWith('http://') || src.startsWith('https://')) return src;
    if (src.startsWith('//')) return 'https:' + src;
    if (src.startsWith('/')) return location.origin.replace(/\/$/, '') + src;
    return location.origin.replace(/\/$/, '') + '/' + src.replace(/^\.\//, '');
  };

  const decodeSvgDataUri = (src) => {
    if (src.includes(';base64,')) {
      return atob(src.split(';base64,')[1]);
    }
    if (src.includes(';utf8,') || src.includes(';charset=utf-8,')) {
      return src.split(/;(?:utf8|charset=utf-8),/)[1];
    }
    return decodeURIComponent(src.split(',').slice(1).join(','));
  };

  const fetchSvgContent = async (imgHtml) => {
    const srcMatch = imgHtml.match(/src=["']([^"']+)["']/);
    if (!srcMatch) return null;
    const src = srcMatch[1];

    // Data URIs: decode directly
    if (src.startsWith('data:image/svg+xml')) {
      try {
        return decodeSvgDataUri(src);
      } catch (_) {
        return null;
      }
    }

    // Remote URLs: fetch (agent-browser's Chromium has no CORS restrictions
    // since it controls the browser directly)
    const url = resolveUrl(src);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(url, {
        headers: { Accept: 'image/svg+xml, text/xml, application/xml, */*' },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!resp.ok) return null;
      const text = await resp.text();
      // Verify it's actually SVG
      if (text.includes('<svg') || text.includes('http://www.w3.org/2000/svg')) {
        return text;
      }
      return null;
    } catch (_) {
      return null;
    }
  };

  // ---------------------------------------------------------------------------
  // Assemble, deduplicate, resolve, return
  // ---------------------------------------------------------------------------

  const all = [
    ...parseSourceAndBgImages(),
    ...gatherInlineSvgs(),
    ...gatherGElements(),
    ...gatherSymbols(),
    ...gatherUseElements(),
    ...gatherShadowDomSvgs(),
    ...gatherCssVarSvgs(),
    ...gatherWebComponentSvgs(),
    ...gatherCssContentSvgs(),
    ...gatherTemplateSvgs(),
    ...gatherSpriteSvgs(),
    ...gatherPictureSvgs(),
  ];

  const unique = [...new Set(all)].filter((s) => s.trim().length > 0);

  // Build initial result list
  const items = unique.map((svg, i) => ({
    id: i + 1,
    name: bestName(svg, i),
    type: classify(svg),
    svg,
  }));

  // Resolve image-refs: fetch actual SVG content, promote to inline
  const resolved = await Promise.all(
    items.map(async (item) => {
      if (item.type !== 'image-ref') return item;
      const content = await fetchSvgContent(item.svg);
      if (content) {
        // Ensure xmlns for standalone rendering
        let svg = content.trim();
        if (svg.includes('<svg') && !svg.includes('xmlns=')) {
          svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
        }
        return { ...item, type: 'inline', svg, originalRef: item.svg };
      }
      return item; // keep as image-ref if fetch failed
    })
  );

  return JSON.stringify({
    data: resolved,
    count: resolved.length,
    host: location.host,
    href: location.href,
    origin: location.origin,
  });
})();
